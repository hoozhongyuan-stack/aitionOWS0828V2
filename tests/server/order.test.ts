import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

/**
 * V4.0 交易域核心测试:订单服务(快照重算/无价商品拒/限频/状态机)+ 商店设置 + JSON-LD offers。
 * getActiveUserSession 以 vi.mock 注入空会话(游客下单路径,与 next/headers 解耦)。
 */

vi.mock("@/lib/auth/session", () => ({
  getActiveUserSession: async () => null,
  ADMIN_COOKIE: "aition_admin",
  USER_COOKIE: "aition_user",
}));

type OrderModule = typeof import("@/server/order");
type ShopModule = typeof import("@/server/shop");

let db: PrismaClient;
let orderMod: OrderModule;
let shopMod: ShopModule;
let productAId = 0;
let productBId = 0;
let articleId = 0;

async function seedCategoryAndProducts() {
  const cat = await db.category.create({
    data: {
      slug: `v4shop-${Date.now()}`,
      moduleType: "product",
      translations: { create: { locale: "zh-CN", name: "V4 商店测试栏目" } },
    },
  });
  const mk = async (slug: string, priceCents: number | null, currency: string | null) =>
    db.content.create({
      data: {
        slug,
        categoryId: cat.id,
        status: "PUBLISHED",
        priceCents,
        currency,
        translations: { create: { locale: "zh-CN", title: `商品 ${slug}`, body: "测试正文" } },
      },
    });
  productAId = (await mk(`v4-prod-a-${Date.now()}`, 129900, "USD")).id;
  productBId = (await mk(`v4-prod-b-${Date.now()}`, 5000, "USD")).id;
  articleId = (await mk(`v4-article-${Date.now()}`, null, null)).id; // 无价=仅询盘
}

beforeAll(async () => {
  const dbMod = await import("@/lib/db");
  db = dbMod.prisma;
  orderMod = (await import("@/server/order")) as OrderModule;
  shopMod = (await import("@/server/shop")) as ShopModule;
  await seedCategoryAndProducts();
});

function baseInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    lines: [{ contentId: productAId, qty: 1 }],
    email: "buyer@example.com",
    name: "Test Buyer",
    country: "US",
    address: "1 Main St",
    city: "Springfield",
    locale: "en",
    ...overrides,
  };
}

describe("V4.0 订单服务 createOrder", () => {
  it("服务端按现价重算金额并落快照;前端不传价格;订单号格式 AO-YYYYMMDD-XXXX", async () => {
    const r = await orderMod.createOrder(baseInput());
    expect(r.no).toMatch(/^AO-\d{8}-\d{4}$/);
    expect(r.currency).toBe("USD");
    expect(r.grandTotalCents).toBe(129900); // 1299.00 无运费(默认免运费)
    const order = await db.order.findUnique({ where: { no: r.no }, include: { items: true } });
    expect(order?.status).toBe("PENDING");
    expect(order?.items[0]?.titleSnapshot).toContain("v4-prod-a");
    expect(order?.items[0]?.priceCentsSnapshot).toBe(129900);
    // 清理
    await db.order.delete({ where: { no: r.no } });
  });

  it("无价商品(仅询盘)不可下单", async () => {
    await expect(orderMod.createOrder(baseInput({ lines: [{ contentId: articleId, qty: 1 }] }))).rejects.toThrow(
      /不支持在线购买/
    );
  });

  it("同邮箱每小时限 5 单", async () => {
    const email = `freq-${Date.now()}@example.com`;
    for (let i = 0; i < 5; i++) {
      const r = await orderMod.createOrder(baseInput({ email }));
      created.push(r.no);
    }
    await expect(orderMod.createOrder(baseInput({ email }))).rejects.toThrow(/频繁/);
  });

  it("多币种购物车拒绝", async () => {
    await db.content.update({ where: { id: productBId }, data: { currency: "EUR" } });
    await expect(
      orderMod.createOrder(baseInput({ lines: [{ contentId: productAId, qty: 1 }, { contentId: productBId, qty: 1 }] }))
    ).rejects.toThrow(/币种/);
    await db.content.update({ where: { id: productBId }, data: { currency: "USD" } });
  });

  it("缺必填字段/空购物车拒绝", async () => {
    await expect(orderMod.createOrder(baseInput({ email: "bad-email" }))).rejects.toThrow(/邮箱/);
    await expect(orderMod.createOrder(baseInput({ lines: [] }))).rejects.toThrow(/购物车/);
    await expect(orderMod.createOrder(baseInput({ address: "" }))).rejects.toThrow(/地址/);
  });
});

const created: string[] = [];

describe("V4.0 订单状态机 transitionOrder", () => {
  let pendingNo: string;
  let pendingId = 0;

  beforeAll(async () => {
    const r = await orderMod.createOrder(baseInput({ email: "flow@example.com" }));
    pendingNo = r.no;
    created.push(pendingNo);
    const order = await db.order.findUnique({ where: { no: pendingNo } });
    pendingId = order!.id;
  });

  it("合法主链:PENDING→CONFIRMED→SHIPPED→COMPLETED,时间戳落库+备注", async () => {
    const confirmed = await orderMod.transitionOrder(pendingId, "confirm", { adminNote: "已收到转账" });
    expect(confirmed.status).toBe("CONFIRMED");
    expect(confirmed.confirmedAt).toBeTruthy();
    const shipped = await orderMod.transitionOrder(pendingId, "ship", { adminNote: "SF123456" });
    expect(shipped.status).toBe("SHIPPED");
    expect(shipped.adminNote).toBe("SF123456");
    const completed = await orderMod.transitionOrder(pendingId, "complete");
    expect(completed.status).toBe("COMPLETED");
  });

  it("终态再操作拒绝", async () => {
    await expect(orderMod.transitionOrder(pendingId, "cancel")).rejects.toThrow(/不允许/);
  });

  it("非法跳步拒绝(PENDING 直达 SHIPPED)", async () => {
    const r = await orderMod.createOrder(baseInput({ email: "skip@example.com" }));
    created.push(r.no);
    const order = await db.order.findUnique({ where: { no: r.no } });
    await expect(orderMod.transitionOrder(order!.id, "ship")).rejects.toThrow(/不允许/);
  });

  it("已确认订单可取消", async () => {
    const r = await orderMod.createOrder(baseInput({ email: "cancel@example.com" }));
    created.push(r.no);
    const order = await db.order.findUnique({ where: { no: r.no } });
    const cancelled = await orderMod.transitionOrder(order!.id, "cancel", { adminNote: "买家要求" });
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancelledAt).toBeTruthy();
  });
});

describe("V4.0 商店设置服务", () => {
  it("缺省配置:USD/无付款指引/免运费", async () => {
    const cfg = await shopMod.getShopConfig();
    expect(cfg.currency).toBe("USD");
    expect(cfg.shippingFeeCents).toBe(0);
  });

  it("保存往返+运费计算(满额免邮优先)", async () => {
    await shopMod.saveShopConfig({
      currency: "EUR",
      paymentInfo: "PayPal: pay@test.io",
      shippingFeeCents: 995,
      freeShippingOverCents: 20000,
    });
    const cfg = await shopMod.getShopConfig();
    expect(cfg.currency).toBe("EUR");
    expect(cfg.paymentInfo).toContain("pay@test.io");
    expect(shopMod.calcShipping(10000, cfg)).toBe(995); // 未达门槛收运费
    expect(shopMod.calcShipping(20000, cfg)).toBe(0); // 达门槛免邮
    // 还原默认,避免影响其它用例
    await shopMod.saveShopConfig({ currency: "USD", paymentInfo: "", shippingFeeCents: 0, freeShippingOverCents: null });
  });
});

describe("V4.0 JSON-LD offers", () => {
  it("有价商品输出 offers,无价商品省略字段", async () => {
    const { ProductJsonLd } = await import("@/components/seo/json-ld");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const withPrice = renderToStaticMarkup(
      ProductJsonLd({
        name: "P",
        description: "D",
        image: null,
        url: "https://x.test/p",
        price: { cents: 129900, currency: "USD" },
      })
    );
    expect(withPrice).toContain('"offers"');
    expect(withPrice).toContain("1299.00");
    const noPrice = renderToStaticMarkup(ProductJsonLd({ name: "P", description: "D", image: null, url: "https://x.test/p" }));
    expect(noPrice).not.toContain('"offers"');
  });
});

afterAll(async () => {
  // 测试数据保留(工作区约定:测试数据不删),仅断开连接
  await db.$disconnect();
});
