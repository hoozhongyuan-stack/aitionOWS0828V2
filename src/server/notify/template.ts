import {
  getBrandConfig,
  getThemeConfig,
  type BrandConfig,
  type ThemeConfig,
} from "@/lib/config";

/**
 * 品牌 HTML 邮件模板层(REQ-010/011/012, TASK-010)。
 *
 * 铁律:
 *  - 表格布局 + 全部内联样式:不输出 <style>/<link>,不依赖外部 CSS(邮件客户端兼容);
 *  - 所有用户可控文本统一 escapeHtml;注入 style 属性的主题色等配置值先经 safeStyleValue 净化;
 *  - 纯 TS 模板函数,零新增依赖;
 *  - 品牌/主题配置默认内部读取后台配置(getBrandConfig/getThemeConfig),可选参数注入以便测试;
 *    配置读取失败时兜底内置默认值 —— 渲染永远成功(NFR-004:邮件问题不得影响业务流程)。
 */

export type EmailBlock =
  | { type: "paragraph"; text: string }
  | { type: "kvTable"; rows: { k: string; v: string }[] }
  | { type: "highlight"; text: string };

export interface EmailCta {
  label: string;
  url: string;
}

export interface BrandEmailOptions {
  /** 正文标题(可选;用主题色强调) */
  heading?: string;
  /** 正文区块 */
  blocks: EmailBlock[];
  /** 可选 CTA 大按钮 */
  cta?: EmailCta;
  /** 品牌配置注入(缺省内部读取后台配置;测试用) */
  brand?: Partial<BrandConfig>;
  /** 主题配置注入(缺省内部读取后台配置;测试用) */
  theme?: Pick<ThemeConfig, "primary">;
  /** 站点根地址(相对 URL 绝对化用;缺省 NEXT_PUBLIC_SITE_URL,再缺省 http://localhost:3000) */
  baseUrl?: string;
}

export interface PasswordResetEmailOptions {
  /**
   * 重置请求的界面语言。
   * locale 规则:归一化(trim + 小写)后以 "zh" 开头(zh/zh-CN/zh-TW…)→ 中文文案;
   * 其余任何值(含空串/非法值)一律回退英文。理由:与 password-reset 服务现行
   * startsWith("zh") 判定一致,且不依赖 DB(邮件文案永远确定、可离线渲染)。
   */
  locale: string;
  /** 绝对重置链接(含一次性 token,调用方负责生成) */
  resetUrl: string;
  /** 链接有效期(分钟) */
  expireMinutes: number;
  brand?: Partial<BrandConfig>;
  theme?: Pick<ThemeConfig, "primary">;
  baseUrl?: string;
}

export interface FormSubmissionNotifyOptions {
  formName: string;
  /** 表单字段(键值表呈现;label/value 均为用户可控,渲染时转义) */
  fields: { label: string; value: string }[];
  /** 来源页(绝对 URL) */
  sourceUrl?: string;
  ip?: string;
  /** 已格式化的提交时间字符串(时区/格式由调用方决定) */
  submittedAt?: string;
  /** 后台处理页(绝对 URL);缺省不渲染 CTA */
  adminUrl?: string;
  brand?: Partial<BrandConfig>;
  theme?: Pick<ThemeConfig, "primary">;
  baseUrl?: string;
}

export interface UgcPendingNotifyOptions {
  kind: "comment" | "submission";
  title: string;
  author?: string;
  adminUrl?: string;
  brand?: Partial<BrandConfig>;
  theme?: Pick<ThemeConfig, "primary">;
  baseUrl?: string;
}

// —— 内置兜底配置(与 src/lib/config 的默认值保持一致;仅模板用到的字段有意义) ——
const FALLBACK_BRAND: BrandConfig = {
  siteName: "AitionOWS",
  ownerName: "",
  tagline: "",
  logoUrl: "",
  footerLogoUrl: "",
  faviconUrl: "",
  shareImageUrl: "",
  icp: "",
  copyright: `© ${new Date().getFullYear()} AitionOWS. All rights reserved.`,
  copyrightUrl: "",
  supportEmail: "",
  contactPhone: "",
  contactEmail: "",
  contactAddress: "",
  socials: [],
  maintenance: false,
  maintenanceText: "",
};
const FALLBACK_PRIMARY = "#0f172a";

// —— 基础工具 ——

/** 用户可控文本统一转义(& < > " ') */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 多行文本:转义后把换行渲染为 <br /> */
function escapeMultiline(value: string): string {
  return escapeHtml(value).replace(/\r\n|\n|\r/g, "<br />");
}

/** 注入 style 属性的值(如主题色)净化:剥除可逃出属性/注入其他样式的字符 */
function safeStyleValue(value: string): string {
  return value.replace(/["'`<>;{}\\]/g, "").trim();
}

/** 相对路径绝对化;绝对 URL/data: 原样返回;空串返回空串 */
function absolutizeUrl(url: string, base: string): string {
  const u = url.trim();
  if (!u) return "";
  if (/^(https?:)?\/\//i.test(u) || /^data:/i.test(u)) {
    return u.startsWith("//") ? `https:${u}` : u;
  }
  return `${base}/${u.replace(/^\//, "")}`;
}

function resolveBaseUrl(explicit?: string): string {
  return (explicit ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    ""
  );
}

async function resolveBrand(injected?: Partial<BrandConfig>): Promise<BrandConfig> {
  if (injected) return { ...FALLBACK_BRAND, ...injected };
  try {
    return await getBrandConfig();
  } catch {
    return FALLBACK_BRAND;
  }
}

async function resolvePrimary(injected?: Pick<ThemeConfig, "primary">): Promise<string> {
  if (injected?.primary) return injected.primary;
  try {
    return (await getThemeConfig()).primary || FALLBACK_PRIMARY;
  } catch {
    return FALLBACK_PRIMARY;
  }
}

// —— 区块渲染(表格布局 + 内联样式) ——

function renderBlock(block: EmailBlock, primaryStyle: string): string {
  switch (block.type) {
    case "paragraph":
      return `<p style="margin:0 0 12px 0;font-size:14px;line-height:1.7;color:#374151;word-break:break-word;">${escapeMultiline(block.text)}</p>`;
    case "kvTable": {
      const rows = block.rows
        .map(
          (r) =>
            `<tr><td width="30%" style="padding:8px 12px;border:1px solid #e5e7eb;background-color:#f8fafc;font-size:13px;font-weight:bold;color:#111827;vertical-align:top;">${escapeMultiline(r.k)}</td>` +
            `<td style="padding:8px 12px;border:1px solid #e5e7eb;font-size:13px;color:#374151;word-break:break-word;">${escapeMultiline(r.v)}</td></tr>`
        )
        .join("");
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:0 0 16px 0;"><tbody>${rows}</tbody></table>`;
    }
    case "highlight":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:0 0 16px 0;"><tbody><tr><td style="padding:12px 16px;background-color:#fffbeb;border-left:4px solid ${primaryStyle};font-size:13px;line-height:1.7;color:#92400e;word-break:break-word;">${escapeMultiline(block.text)}</td></tr></tbody></table>`;
  }
}

/**
 * 品牌邮件骨架:品牌头部(LOGO 绝对 URL + 站点名,缺 LOGO 兜底文字)+ 标题 +
 * 区块正文 + 可选 CTA 大按钮 + 页脚(版权/备案)。完整独立 HTML,样式全内联。
 */
export async function renderBrandEmail(opts: BrandEmailOptions): Promise<string> {
  const brand = await resolveBrand(opts.brand);
  const primaryStyle = safeStyleValue(await resolvePrimary(opts.theme));
  const base = resolveBaseUrl(opts.baseUrl);

  // 品牌头部:LOGO(绝对 URL)+ 站点名;LOGO 缺省时兜底为站点名文字(主题色)
  const logoAbs = absolutizeUrl(brand.logoUrl, base);
  const brandCell = logoAbs
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tbody><tr><td style="vertical-align:middle;"><img src="${escapeHtml(logoAbs)}" alt="${escapeHtml(brand.siteName)}" style="display:block;max-height:40px;max-width:160px;border:0;vertical-align:middle;" /></td><td style="vertical-align:middle;padding-left:12px;font-size:18px;font-weight:bold;color:#111827;">${escapeHtml(brand.siteName)}</td></tr></tbody></table>`
    : `<span style="font-size:20px;font-weight:bold;color:${primaryStyle};">${escapeHtml(brand.siteName)}</span>`;

  const headingRow = opts.heading
    ? `<tr><td style="padding:28px 32px 0 32px;"><h1 style="margin:0;font-size:20px;line-height:1.4;color:${primaryStyle};">${escapeMultiline(opts.heading)}</h1></td></tr>`
    : "";

  const blocksHtml = opts.blocks.map((b) => renderBlock(b, primaryStyle)).join("");
  const contentRow = blocksHtml
    ? `<tr><td style="padding:20px 32px 0 32px;">${blocksHtml}</td></tr>`
    : "";

  const ctaRow = opts.cta
    ? `<tr><td align="left" style="padding:24px 32px 8px 32px;"><a href="${escapeHtml(absolutizeUrl(opts.cta.url, base) || opts.cta.url)}" style="display:inline-block;background-color:${primaryStyle};color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;padding:12px 32px;border-radius:6px;">${escapeHtml(opts.cta.label)}</a></td></tr>`
    : "";

  const icpLine = brand.icp.trim()
    ? `<p style="margin:4px 0 0 0;font-size:12px;line-height:1.6;color:#9ca3af;">${escapeHtml(brand.icp)}</p>`
    : "";
  const footerRow = `<tr><td style="padding:16px 32px;background-color:#f8fafc;border-top:1px solid #e5e7eb;"><p style="margin:0;font-size:12px;line-height:1.6;color:#9ca3af;">${escapeHtml(brand.copyright)}</p>${icpLine}</td></tr>`;

  return [
    `<!DOCTYPE html>`,
    `<html lang="zh-CN">`,
    `<head>`,
    `<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
    `<title>${escapeHtml(opts.heading || brand.siteName)}</title>`,
    `</head>`,
    `<body style="margin:0;padding:0;background-color:#f1f5f9;">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#f1f5f9;"><tbody><tr><td align="center" style="padding:24px 12px;">`,
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background-color:#ffffff;border-radius:8px;font-family:'Helvetica Neue',Helvetica,Arial,'PingFang SC','Microsoft YaHei',sans-serif;"><tbody>`,
    `<tr><td style="padding:24px 32px;border-bottom:1px solid #e5e7eb;">${brandCell}</td></tr>`,
    headingRow,
    contentRow,
    ctaRow,
    `<tr><td style="padding:16px 32px 24px 32px;"></td></tr>`,
    footerRow,
    `</tbody></table>`,
    `</td></tr></tbody></table>`,
    `</body>`,
    `</html>`,
  ].join("");
}

// —— 业务模板 ——

const RESET_COPY = {
  zh: {
    heading: "重置密码",
    body: (site: string) => `我们收到了你在 ${site} 的密码重置请求。请点击下方按钮设置新密码:`,
    hint: (min: number) => `该链接 ${min} 分钟内有效,过期后请重新申请。`,
    ignore: "如果这不是你的操作,请忽略本邮件,你的密码不会改变。",
    cta: "重置密码",
  },
  en: {
    heading: "Reset your password",
    body: (site: string) =>
      `We received a request to reset the password for your ${site} account. Please click the button below to set a new password:`,
    hint: (min: number) =>
      `This link is valid for ${min} minutes. If it expires, please request a new one.`,
    ignore:
      "If you did not request this, please ignore this email and your password will remain unchanged.",
    cta: "Reset password",
  },
} as const;

/** 密码重置邮件(REQ-011):按 locale 输出 zh/en 文案,CTA 与正文均含绝对重置链接 + 有效期提示 */
export async function renderPasswordResetEmail(opts: PasswordResetEmailOptions): Promise<string> {
  const zh = opts.locale.trim().toLowerCase().startsWith("zh");
  const copy = zh ? RESET_COPY.zh : RESET_COPY.en;
  const brand = await resolveBrand(opts.brand);

  return renderBrandEmail({
    heading: copy.heading,
    blocks: [
      { type: "paragraph", text: copy.body(brand.siteName) },
      { type: "highlight", text: copy.hint(opts.expireMinutes) },
      { type: "paragraph", text: copy.ignore },
      { type: "paragraph", text: opts.resetUrl },
    ],
    cta: { label: copy.cta, url: opts.resetUrl },
    brand: opts.brand ?? brand,
    theme: opts.theme,
    baseUrl: opts.baseUrl,
  });
}

/** 表单提交管理员通知(REQ-012):键值表呈现字段,高亮块呈现来源页/IP/时间,CTA 去后台 */
export async function renderFormSubmissionNotify(
  opts: FormSubmissionNotifyOptions
): Promise<string> {
  const meta: string[] = [];
  if (opts.sourceUrl?.trim()) meta.push(`来源页:${opts.sourceUrl}`);
  if (opts.ip?.trim()) meta.push(`IP:${opts.ip}`);
  if (opts.submittedAt?.trim()) meta.push(`提交时间:${opts.submittedAt}`);

  const blocks: EmailBlock[] = [
    ...(opts.fields.length
      ? [{ type: "kvTable" as const, rows: opts.fields.map((f) => ({ k: f.label, v: f.value })) }]
      : []),
    ...(meta.length ? [{ type: "highlight" as const, text: meta.join("\n") }] : []),
  ];

  return renderBrandEmail({
    heading: `收到新的表单提交:${opts.formName}`,
    blocks,
    cta: opts.adminUrl?.trim() ? { label: "去后台处理", url: opts.adminUrl } : undefined,
    brand: opts.brand,
    theme: opts.theme,
    baseUrl: opts.baseUrl,
  });
}

/**
 * 投稿/评论待审提醒(REQ-012)。管理员通知面向站点后台,沿用现行 notifyAdmin
 * 的中文文案口径(不随用户 locale 变化);如需多语言再扩展。
 */
export async function renderUgcPendingNotify(opts: UgcPendingNotifyOptions): Promise<string> {
  // kind:"comment" 分支为预置能力:基线评论流无管理员通知调用点,接线待后续需求
  const isComment = opts.kind === "comment";
  const rows: { k: string; v: string }[] = [
    { k: "类型", v: isComment ? "评论" : "用户投稿" },
    { k: "标题", v: opts.title },
    ...(opts.author?.trim() ? [{ k: "作者", v: opts.author }] : []),
  ];

  return renderBrandEmail({
    heading: isComment ? "收到新的评论,等待审核" : "收到新的用户投稿,等待审核",
    blocks: [
      { type: "kvTable", rows },
      {
        type: "highlight",
        text: isComment
          ? "该评论待审核,审核通过后才会对外展示,请尽快前往后台处理。"
          : "该投稿待审核,审核通过后才会对外展示,请尽快前往后台处理。",
      },
    ],
    cta: opts.adminUrl?.trim() ? { label: "去后台处理", url: opts.adminUrl } : undefined,
    brand: opts.brand,
    theme: opts.theme,
    baseUrl: opts.baseUrl,
  });
}

// ============================================================
// 订单邮件(V4.0;V4.0.1 双语化):下单确认/收款确认/发货/取消。
// 排布:逐段中英对照(中文在上、英文紧随其下,\n 换行),收件人无论语言都能读懂;
// 商品名/金额为下单数据本身,不做翻译。渲染永远成功(NFR-004),发送失败静默。
// ============================================================

export interface OrderEmailLine {
  title: string;
  qty: number;
  priceCents: number;
}

export interface OrderEmailOptions {
  locale: string;
  orderNo: string;
  customerName: string;
  /** 明细行(快照) */
  items: OrderEmailLine[];
  currency: string;
  itemsTotalCents: number;
  shippingCents: number;
  grandTotalCents: number;
  /** 线下付款指引(商店设置;下单确认邮件展示) */
  paymentInfo?: string;
  /** 发货/取消时的备注(物流公司/编号/原因) */
  remark?: string;
  brand?: Partial<BrandConfig>;
  theme?: Pick<ThemeConfig, "primary">;
  baseUrl?: string;
}

function money(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

/** 金额汇总双语段(明细行自身无语言,表头式说明逐行对照) */
function orderSummaryText(o: OrderEmailOptions): string {
  const rows = o.items.map((l) => `・${l.title} × ${l.qty} = ${money(l.priceCents * l.qty, o.currency)}`).join("\n");
  return [
    `${rows}`,
    `商品合计 Items: ${money(o.itemsTotalCents, o.currency)}`,
    `运费 Shipping: ${o.shippingCents > 0 ? money(o.shippingCents, o.currency) : "免运费 Free"}`,
    `应付总额 Total: ${money(o.grandTotalCents, o.currency)}`,
  ].join("\n");
}

/** 下单确认(含线下付款指引) */
export async function renderOrderPlacedEmail(o: OrderEmailOptions): Promise<string> {
  return renderBrandEmail({
    heading: `订单已提交 / Order placed(${o.orderNo})`,
    blocks: [
      { type: "paragraph", text: `${o.customerName},您好!我们已收到您的订单:\nHi ${o.customerName}, we have received your order:` },
      { type: "kvTable", rows: [{ k: "明细 Items", v: orderSummaryText(o) }] },
      ...(o.paymentInfo?.trim()
        ? [
            { type: "highlight" as const, text: `付款方式 Payment:\n${o.paymentInfo.trim()}` },
            { type: "paragraph" as const, text: "完成转账后,我们确认收款将通过邮件通知您。\nWe will email you once your payment is confirmed." },
          ]
        : [{ type: "paragraph" as const, text: "我们会尽快与您联系确认付款事宜。\nWe will contact you shortly to arrange payment." }]),
    ],
    brand: o.brand,
    theme: o.theme,
    baseUrl: o.baseUrl,
  });
}

/** 收款确认 */
export async function renderOrderConfirmedEmail(o: OrderEmailOptions): Promise<string> {
  return renderBrandEmail({
    heading: `收款已确认 / Payment confirmed(${o.orderNo})`,
    blocks: [
      { type: "paragraph", text: `${o.customerName},您好!您的订单已完成付款确认,我们正安排备货:\nHi ${o.customerName}, your payment has been confirmed and your order is being prepared:` },
      { type: "kvTable", rows: [{ k: "明细 Items", v: orderSummaryText(o) }] },
    ],
    brand: o.brand,
    theme: o.theme,
    baseUrl: o.baseUrl,
  });
}

/** 发货通知 */
export async function renderOrderShippedEmail(o: OrderEmailOptions): Promise<string> {
  return renderBrandEmail({
    heading: `订单已发货 / Order shipped(${o.orderNo})`,
    blocks: [
      { type: "paragraph", text: `${o.customerName},您好!您的订单已发出:\nHi ${o.customerName}, your order has been shipped:` },
      { type: "kvTable", rows: [{ k: "明细 Items", v: orderSummaryText(o) }] },
      ...(o.remark?.trim() ? [{ type: "highlight" as const, text: `物流信息 Shipping:\n${o.remark.trim()}` }] : []),
    ],
    brand: o.brand,
    theme: o.theme,
    baseUrl: o.baseUrl,
  });
}

/** 取消通知 */
export async function renderOrderCancelledEmail(o: OrderEmailOptions): Promise<string> {
  return renderBrandEmail({
    heading: `订单已取消 / Order cancelled(${o.orderNo})`,
    blocks: [
      { type: "paragraph", text: `${o.customerName},您好!您的订单已取消:\nHi ${o.customerName}, your order has been cancelled:` },
      { type: "kvTable", rows: [{ k: "明细 Items", v: orderSummaryText(o) }] },
      ...(o.remark?.trim() ? [{ type: "paragraph" as const, text: `原因 / Reason: ${o.remark.trim()}` }] : []),
    ],
    brand: o.brand,
    theme: o.theme,
    baseUrl: o.baseUrl,
  });
}

/** 售后审核结果邮件(V4.2):双语对照;通过含退款金额,拒绝含原因 */
export interface OrderRefundEmailOptions {
  locale: string;
  orderNo: string;
  customerName: string;
  items: OrderEmailLine[];
  currency: string;
  itemsTotalCents: number;
  shippingCents: number;
  grandTotalCents: number;
  approved: boolean;
  refundAmountCents: number | null;
  remark?: string;
  brand?: Partial<BrandConfig>;
  theme?: Pick<ThemeConfig, "primary">;
  baseUrl?: string;
}

export async function renderOrderRefundEmail(o: OrderRefundEmailOptions): Promise<string> {
  const amountLine = o.approved && o.refundAmountCents != null ? `退款金额 Refund: ${money(o.refundAmountCents, o.currency)}\n` : "";
  const remarkLine = o.remark?.trim() ? `备注 / Note: ${o.remark.trim()}\n` : "";
  return renderBrandEmail({
    heading: o.approved ? `售后已通过 / Refund approved(${o.orderNo})` : `售后未通过 / Refund rejected(${o.orderNo})`,
    blocks: [
      {
        type: "paragraph",
        text: o.approved
          ? `${o.customerName},您好!您的售后申请已通过:\\nHi ${o.customerName}, your refund request has been approved:`
          : `${o.customerName},您好!很抱歉,您的售后申请未通过:\\nHi ${o.customerName}, unfortunately your refund request was not approved:`,
      },
      { type: "highlight", text: `${amountLine}${remarkLine}` },
      { type: "kvTable", rows: [{ k: "订单明细 Order items", v: orderSummaryText(o) }] },
      ...(o.approved
        ? [{ type: "paragraph" as const, text: "退款将按原付款方式退回,请留意查收。\\nThe refund will be returned via your original payment method." }]
        : [{ type: "paragraph" as const, text: "如有疑问请联系我们。\\nIf you have any questions, please contact us." }]),
    ],
    brand: o.brand,
    theme: o.theme,
    baseUrl: o.baseUrl,
  });
}
