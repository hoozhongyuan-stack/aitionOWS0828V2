import { prisma } from "@/lib/db";
import { getActiveUserSession } from "@/lib/auth/session";
import { calcShipping, getShopConfig } from "@/server/shop";
import {
  renderOrderPlacedEmail,
  renderOrderConfirmedEmail,
  renderOrderShippedEmail,
  renderOrderCancelledEmail,
  renderOrderRefundEmail,
} from "@/server/notify/template";
import { sendMail, notifyAdmin } from "@/server/notify";

/**
 * 订单服务(V4.0 · 交易 MVP):线下付款 + 后台审核流。
 * 铁律:金额一律服务端按商品现价重算(前端所传仅 contentId+qty),OrderItem 存快照;
 * 状态机 PENDING→CONFIRMED→SHIPPED→COMPLETED,任意非终态可 CANCELLED;
 * 每次状态变更触发买家邮件(渲染/发送失败静默,NFR-004,不影响订单本身)。
 */

export const ORDER_STATUS = {
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  SHIPPED: "SHIPPED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  REFUNDED: "REFUNDED", // V4.2 售后退款完成
} as const;
export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

/** 合法状态转换表(admin 操作驱动;买家不可自行取消——线下流中取消由后台统一处理) */
const TRANSITIONS: Record<string, { to: string; at: string }[]> = {
  PENDING: [
    { to: "CONFIRMED", at: "confirmedAt" },
    { to: "CANCELLED", at: "cancelledAt" },
  ],
  CONFIRMED: [
    { to: "SHIPPED", at: "shippedAt" },
    { to: "CANCELLED", at: "cancelledAt" },
    { to: "REFUNDED", at: "refundedAt" },
  ],
  SHIPPED: [
    { to: "COMPLETED", at: "completedAt" },
    { to: "CANCELLED", at: "cancelledAt" },
    { to: "REFUNDED", at: "refundedAt" },
  ],
  // 已支付订单(CONFIRMED/SHIPPED/COMPLETED)可经售后审核流转为已退款(V4.2)
  COMPLETED: [{ to: "REFUNDED", at: "refundedAt" }],
  REFUNDED: [],
  CANCELLED: [],
};

export interface CreateOrderInput {
  lines: { contentId: number; qty: number }[];
  email: string;
  name: string;
  phone?: string;
  country: string;
  address: string;
  city: string;
  zip?: string;
  note?: string;
  /** 买家界面语言(订单邮件文案) */
  locale: string;
  /** 请求来源 IP(预留:当前限频按邮箱维度) */
  clientIp?: string;
}

export interface OrderView {
  id: number;
  no: string;
  status: OrderStatus;
  email: string;
  name: string;
  phone: string | null;
  country: string;
  address: string;
  city: string;
  zip: string | null;
  note: string | null;
  currency: string;
  itemsTotalCents: number;
  shippingCents: number;
  grandTotalCents: number;
  adminNote: string | null;
  shippingCarrier: string | null;
  trackingNumber: string | null;
  createdAt: Date;
  confirmedAt: Date | null;
  shippedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  items: { id: number; contentId: number; titleSnapshot: string; priceCentsSnapshot: number; currency: string; qty: number; spu: string | null; coverUrl: string | null }[];
  refundedAt?: Date | null;
  refund?: { id: number; reason: string; status: string; refundAmountCents: number | null; adminNote: string | null; createdAt: Date; reviewedAt: Date | null } | null;
  /** 下单账号(V4.0.2):登录用户名下信息;游客单为 null */
  accountName?: string | null;
  accountEmail?: string | null;
  account?: { name: string | null; email: string | null; createdAt: Date } | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LINES = 50;
const RATE_LIMIT_PER_HOUR = 5;

function genOrderNo(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `AO-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${rand}`;
}

/** 下单限频:同邮箱每小时最多 RATE_LIMIT_PER_HOUR 单(防灌水;email 已有索引) */
async function rateLimited(email: string): Promise<boolean> {
  const since = new Date(Date.now() - 3_600_000);
  const count = await prisma.order.count({ where: { email, createdAt: { gte: since } } });
  return count >= RATE_LIMIT_PER_HOUR;
}

/**
 * 创建订单(游客可下单):服务端重算金额 → 快照落库 → 异步发下单确认邮件。
 * 抛 Error(message) 由 API 层转 400;成功返回订单号与应付信息。
 */
export async function createOrder(input: CreateOrderInput): Promise<{ no: string; grandTotalCents: number; currency: string }> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error("邮箱格式不正确");
  if (!input.name?.trim()) throw new Error("请填写姓名");
  if (!input.country?.trim() || !input.address?.trim() || !input.city?.trim()) throw new Error("请填写完整收货地址");
  const lines = (input.lines ?? []).filter((l) => Number.isInteger(l.contentId) && l.contentId > 0);
  if (lines.length === 0) throw new Error("购物车为空");
  if (lines.length > MAX_LINES) throw new Error("单笔订单商品种类过多");

  for (const l of lines) {
    if (!Number.isInteger(l.qty) || l.qty < 1 || l.qty > 99) throw new Error("商品数量不合法");
  }
  if (await rateLimited(email)) throw new Error("下单过于频繁,请稍后再试");

  const contents = await prisma.content.findMany({
    where: { id: { in: lines.map((l) => l.contentId) }, status: "PUBLISHED" },
    include: { translations: true },
  });
  const byId = new Map(contents.map((c) => [c.id, c] as const));
  for (const l of lines) {
    const c = byId.get(l.contentId);
    if (!c) throw new Error("商品不存在或已下架");
    if (c.priceCents == null) throw new Error(`「${c.slug}」不支持在线购买`);
  }

  // 币种一致性:整单必须同币种(MVP 单币种结算)
  const currencies = new Set(lines.map((l) => byId.get(l.contentId)!.currency || "USD"));
  if (currencies.size > 1) throw new Error("购物车包含多种币种,请分开下单");
  const currency = [...currencies][0];

  const shop = await getShopConfig();
  const displayCurrency = currency || shop.currency;
  const priced = lines.map((l) => {
    const c = byId.get(l.contentId)!;
    const t = c.translations.find((x) => x.locale === input.locale) ?? c.translations[0];
    return {
      contentId: c.id,
      titleSnapshot: t?.title || c.slug,
      priceCentsSnapshot: c.priceCents!,
      currency: displayCurrency,
      qty: l.qty,
      spu: c.spu || null, // SPU 快照(V4.0.2)
      coverUrl: c.coverUrl || null, // 封面快照(V4.0.2,明细缩略图)
    };
  });
  const itemsTotalCents = priced.reduce((n, l) => n + l.priceCentsSnapshot * l.qty, 0);
  const shippingCents = calcShipping(itemsTotalCents, shop);

  const order = await prisma.order.create({
    data: {
      no: genOrderNo(),
      status: ORDER_STATUS.PENDING,
      userId: (await getActiveUserSession())?.id ?? null,
      email,
      name: input.name.trim().slice(0, 80),
      phone: input.phone?.trim().slice(0, 40) || null,
      country: input.country.trim().slice(0, 80),
      address: input.address.trim().slice(0, 200),
      city: input.city.trim().slice(0, 80),
      zip: input.zip?.trim().slice(0, 20) || null,
      note: input.note?.trim().slice(0, 500) || null,
      currency: displayCurrency,
      itemsTotalCents,
      shippingCents,
      grandTotalCents: itemsTotalCents + shippingCents,
      items: { create: priced },
    },
    include: { items: true },
  });

  // 异步邮件:买家下单确认(含付款指引)+ 管理员通知;失败静默不影响订单
  void (async () => {
    try {
      const opts = {
        locale: input.locale,
        orderNo: order.no,
        customerName: order.name,
        items: priced.map((l) => ({ title: l.titleSnapshot, qty: l.qty, priceCents: l.priceCentsSnapshot })),
        currency: displayCurrency,
        itemsTotalCents,
        shippingCents,
        grandTotalCents: order.grandTotalCents,
      };
      const html = await renderOrderPlacedEmail({ ...opts, paymentInfo: shop.paymentInfo });
      await sendMail({ to: [order.email], subject: `订单已提交 ${order.no}`, lines: [order.no], html });
    } catch {
      /* 静默 */
    }
  })();
  void notifyAdmin("新订单待确认", [`订单号:${order.no}`, `买家:${order.name} <${order.email}>`, `金额:${(order.grandTotalCents / 100).toFixed(2)} ${displayCurrency}`]);

  return { no: order.no, grandTotalCents: order.grandTotalCents, currency: displayCurrency };
}

/** 买家订单查询(邮箱+订单号双因子;不暴露其它人订单) */
export async function getOrderByNoAndEmail(no: string, email: string): Promise<OrderView | null> {
  const order = await prisma.order.findUnique({
    where: { no },
    include: { items: true, refund: true },
  });
  if (!order || order.email !== email.trim().toLowerCase()) return null;
  return order as OrderView;
}

export interface AdminOrderQuery {
  status?: string;
  q?: string;
  /** 下单时间区间(ISO 日期 YYYY-MM-DD,含端点;from/to 成对可单边) */
  from?: string;
  to?: string;
  /** V4.1.1:仅看有待审核售后的订单 */
  refundPending?: boolean;
  page?: number;
  pageSize?: number;
}

export async function listOrdersAdmin(q: AdminOrderQuery) {
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 20));
  const where: Record<string, unknown> = {};
  if (q.status && Object.values(ORDER_STATUS).includes(q.status as OrderStatus)) where.status = q.status;
  const kw = q.q?.trim();
  if (kw) where.OR = [{ no: { contains: kw } }, { email: { contains: kw } }, { name: { contains: kw } }];
  const createdAt: Record<string, Date> = {};
  if (q.from && /^\d{4}-\d{2}-\d{2}$/.test(q.from)) createdAt.gte = new Date(`${q.from}T00:00:00`);
  if (q.to && /^\d{4}-\d{2}-\d{2}$/.test(q.to)) createdAt.lte = new Date(`${q.to}T23:59:59.999`);
  if (Object.keys(createdAt).length) where.createdAt = createdAt;
  // 售后中筛选(V4.1.1):有待审核(PENDING)售后的订单
  if (q.refundPending) where.refund = { status: "PENDING" };
  const [total, items] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { items: true, refund: true },
    }),
  ]);
  // 下单账号信息(V4.0.2):收件人可能≠登录账号,列表双行展示
  const userIds = [...new Set(items.map((o) => o.userId).filter((v): v is number => v != null))];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nickname: true, email: true } })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));
  return {
    total,
    page,
    pageSize,
    items: items.map((o) => ({
      ...o,
      accountName: (o.userId && userMap.get(o.userId)?.nickname) || null,
      accountEmail: (o.userId && userMap.get(o.userId)?.email) || null,
    })),
  };
}

export async function getOrderAdmin(id: number): Promise<OrderView | null> {
  const order = await prisma.order.findUnique({ where: { id }, include: { items: true, refund: true } });
  if (!order) return null;
  // 下单账号信息(V4.0.2):详情页独立区块展示
  const account = order.userId
    ? await prisma.user.findUnique({
        where: { id: order.userId },
        select: { nickname: true, email: true, createdAt: true },
      })
    : null;
  return {
    ...(order as OrderView),
    account: account ? { name: account.nickname, email: account.email, createdAt: account.createdAt } : null,
  };
}

/** 我的订单(前台个人中心):登录账号名下订单,含明细与物流;时间倒序 */
export async function listOrdersByUser(userId: number): Promise<OrderView[]> {
  const orders = await prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { items: true, refund: true },
  });
  return orders as OrderView[];
}

export type OrderAction = "confirm" | "ship" | "complete" | "cancel" | "refund";

/**
 * 订单状态流转(后台):校验合法转换 → 更新状态与时间戳 → 异步发买家邮件。
 * 抛 Error(message) 由 API 层转 400(非法转换/终态再操作)。
 */
export async function transitionOrder(
  id: number,
  action: OrderAction,
  opts: { adminNote?: string; locale?: string; shippingCarrier?: string; trackingNumber?: string } = {}
): Promise<OrderView> {
  const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) throw new Error("订单不存在");

  const actionMap: Record<OrderAction, { to: string; at: string } | undefined> = {
    confirm: TRANSITIONS[order.status]?.find((t) => t.to === "CONFIRMED"),
    ship: TRANSITIONS[order.status]?.find((t) => t.to === "SHIPPED"),
    complete: TRANSITIONS[order.status]?.find((t) => t.to === "COMPLETED"),
    cancel: TRANSITIONS[order.status]?.find((t) => t.to === "CANCELLED"),
    refund: TRANSITIONS[order.status]?.find((t) => t.to === "REFUNDED"),
  };
  const next = actionMap[action];
  if (!next) throw new Error(`当前状态(${order.status})不允许此操作`);

  const updated = await prisma.order.update({
    where: { id },
    data: {
      status: next.to,
      [next.at]: new Date(),
      ...(opts.adminNote?.trim() ? { adminNote: opts.adminNote.trim().slice(0, 500) } : {}),
      // 物流信息(V4.0.1):仅发货时登记;非必填
      ...(action === "ship"
        ? {
            shippingCarrier: opts.shippingCarrier?.trim().slice(0, 80) || null,
            trackingNumber: opts.trackingNumber?.trim().slice(0, 80) || null,
          }
        : {}),
    },
    include: { items: true },
  });

  // 异步买家邮件(失败静默)
  void (async () => {
    try {
      const optsEmail = {
        locale: opts.locale ?? "en",
        orderNo: updated.no,
        customerName: updated.name,
        items: updated.items.map((i) => ({ title: i.titleSnapshot, qty: i.qty, priceCents: i.priceCentsSnapshot })),
        currency: updated.currency,
        itemsTotalCents: updated.itemsTotalCents,
        shippingCents: updated.shippingCents,
        grandTotalCents: updated.grandTotalCents,
        remark:
          action === "ship"
            ? [opts.shippingCarrier && `物流公司:${opts.shippingCarrier.trim()}`, opts.trackingNumber && `物流编号:${opts.trackingNumber.trim()}`, opts.adminNote && `备注:${opts.adminNote.trim()}`]
                .filter(Boolean)
                .join(" / ")
            : opts.adminNote,
      };
      let html: string | null = null;
      let subject = "";
      if (action === "confirm") {
        html = await renderOrderConfirmedEmail(optsEmail);
        subject = `收款已确认 ${updated.no}`;
      } else if (action === "ship") {
        html = await renderOrderShippedEmail(optsEmail);
        subject = `订单已发货 ${updated.no}`;
      } else if (action === "cancel") {
        html = await renderOrderCancelledEmail(optsEmail);
        subject = `订单已取消 ${updated.no}`;
      }
      if (html) await sendMail({ to: [updated.email], subject, lines: [updated.no], html });
    } catch {
      /* 静默 */
    }
  })();

  return updated as OrderView;
}

// ============================================================
// V4.2 售后(仅退款,一单一次申请)
// ============================================================

/** 用户发起售后:已支付订单(CONFIRMED/SHIPPED/COMPLETED)可申请;归属校验+唯一申请 */
export async function applyRefund(input: { orderNo: string; email?: string; userId?: number; reason: string }) {
  const reason = input.reason?.trim();
  if (!reason) throw new Error("请填写售后原因");
  const order = await prisma.order.findUnique({ where: { no: input.orderNo }, include: { refund: true } });
  if (!order) throw new Error("订单不存在");
  if (input.userId ? order.userId !== input.userId : order.email !== input.email?.trim().toLowerCase()) {
    throw new Error("订单不属于当前用户");
  }
  if (!["CONFIRMED", "SHIPPED", "COMPLETED"].includes(order.status)) throw new Error("当前订单状态不支持申请售后");
  if (order.refund) throw new Error("该订单已提交过售后申请,请勿重复提交");
  const refund = await prisma.orderRefund.create({
    data: { orderId: order.id, reason: reason.slice(0, 500) },
  });
  void notifyAdmin("新售后申请待审核", [
    `订单号:${order.no}`,
    `原因:${reason.slice(0, 100)}`,
  ]);
  return refund;
}

/** 后台审核售后:通过(金额必填且≤实付)/拒绝(备注原因);通过同时订单流转 REFUNDED+双语邮件 */
export async function reviewRefund(input: {
  refundId: number;
  approve: boolean;
  refundAmountCents?: number;
  adminNote?: string;
  reviewerName: string;
}): Promise<void> {
  const refund = await prisma.orderRefund.findUnique({ where: { id: input.refundId }, include: { order: { include: { items: true } } } });
  if (!refund) throw new Error("售后申请不存在");
  if (refund.status !== "PENDING") throw new Error("该售后已处理");
  const order = refund.order;

  if (!input.approve) {
    await prisma.orderRefund.update({
      where: { id: input.refundId },
      data: { status: "REJECTED", adminNote: input.adminNote?.trim().slice(0, 500) || null, reviewedAt: new Date() },
    });
    void (async () => {
      try {
        const html = await renderOrderRefundEmail({
          locale: "zh", orderNo: order.no, customerName: order.name,
          items: order.items.map((i) => ({ title: i.titleSnapshot, qty: i.qty, priceCents: i.priceCentsSnapshot })),
          currency: order.currency, itemsTotalCents: order.itemsTotalCents, shippingCents: order.shippingCents, grandTotalCents: order.grandTotalCents,
          approved: false, refundAmountCents: null, remark: input.adminNote,
        });
        await sendMail({ to: [order.email], subject: `售后审核结果 ${order.no}`, lines: [order.no], html });
      } catch { /* 静默 */ }
    })();
    return;
  }

  const amount = Math.floor(Number(input.refundAmountCents));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("请填写退款金额");
  if (amount > order.grandTotalCents) throw new Error("退款金额不能超过订单实付金额");

  // 售后通过:转换校验+refund/order 双写同事务(防部分成功导致状态不一致)
  const next = TRANSITIONS[order.status]?.find((t) => t.to === "REFUNDED");
  if (!next) throw new Error(`当前状态(${order.status})不允许退款`);
  await prisma.$transaction([
    prisma.orderRefund.update({
      where: { id: input.refundId },
      data: { status: "APPROVED", refundAmountCents: amount, adminNote: input.adminNote?.trim().slice(0, 500) || null, reviewedAt: new Date() },
    }),
    prisma.order.update({
      where: { id: order.id },
      data: { status: "REFUNDED", [next.at]: new Date(), adminNote: `售后退款 ${(amount / 100).toFixed(2)} ${order.currency}` },
    }),
  ]);
  void (async () => {
    try {
      const html = await renderOrderRefundEmail({
        locale: "zh", orderNo: order.no, customerName: order.name,
        items: order.items.map((i) => ({ title: i.titleSnapshot, qty: i.qty, priceCents: i.priceCentsSnapshot })),
        currency: order.currency, itemsTotalCents: order.itemsTotalCents, shippingCents: order.shippingCents, grandTotalCents: order.grandTotalCents,
        approved: true, refundAmountCents: amount, remark: input.adminNote,
      });
      await sendMail({ to: [order.email], subject: `售后审核结果 ${order.no}`, lines: [order.no], html });
    } catch { /* 静默 */ }
  })();
}
