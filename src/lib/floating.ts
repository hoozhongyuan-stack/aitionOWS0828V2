import type { FloatingEntry } from "@/lib/config";

/**
 * 右侧悬浮入口(V4.8.3)—— 纯逻辑,零 IO,可单测。
 *
 * 三种类型:
 *   tel    — 图标 + 号码,点击拨号(tel: 链接,移动端拉起拨号盘)
 *   form   — 图标 + 关联表单,点击在当前页弹层里填表提交(不跳页)
 *   qrcode — 图标 + 二维码图,点击弹层展示大图(加微信场景)
 *
 * 上限 2 条:入口多了会遮挡内容,且右侧竖条本来只适合 1~2 项。
 */

/** 最多可配置的入口条数 */
export const MAX_FLOATING_ENTRIES = 2;

/** 号码净化:只保留数字与 + - 空格 括号,与常见 tel: 写法兼容;结果为空表示无效 */
export function telHref(raw: string): string {
  const cleaned = String(raw ?? "")
    .replace(/[^\d+\-()\s]/g, "") // 去掉字母等字符(含 javascript: 之类)
    .replace(/\s+/g, " ")
    .trim();
  // 至少要有一位数字,否则不算号码
  return /\d/.test(cleaned) ? `tel:${cleaned}` : "";
}

/**
 * 配置清洗:丢弃"配置不完整"的条目(缺图标/缺号码/缺表单/缺二维码),
 * 并封顶 MAX_FLOATING_ENTRIES 条。后台保存与前台渲染共用,避免脏配置渲染出空按钮。
 */
export function normalizeFloatingEntries(input: unknown): FloatingEntry[] {
  if (!Array.isArray(input)) return [];
  const out: FloatingEntry[] = [];
  for (const raw of input) {
    if (out.length >= MAX_FLOATING_ENTRIES) break;
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Partial<FloatingEntry>;
    const iconUrl = typeof e.iconUrl === "string" ? e.iconUrl.trim() : "";
    if (!iconUrl) continue;
    const label = typeof e.label === "string" ? e.label.trim().slice(0, 20) : "";
    if (e.type === "tel") {
      const tel = typeof e.tel === "string" ? e.tel.trim() : "";
      if (!telHref(tel)) continue;
      out.push({ type: "tel", iconUrl, label, tel });
    } else if (e.type === "form") {
      const formId = Number(e.formId);
      if (!Number.isInteger(formId) || formId <= 0) continue;
      out.push({ type: "form", iconUrl, label, formId });
    } else if (e.type === "qrcode") {
      const qrcodeUrl = typeof e.qrcodeUrl === "string" ? e.qrcodeUrl.trim() : "";
      if (!qrcodeUrl) continue;
      out.push({ type: "qrcode", iconUrl, label, qrcodeUrl });
    }
  }
  return out;
}

/** 交给前端组件的形态(form 项已解析出 slug;未启用/已删除的表单会被丢弃) */
export interface FloatingItem {
  key: string;
  type: FloatingEntry["type"];
  iconUrl: string;
  label: string;
  /** tel 项:拨号链接 */
  href?: string;
  /** form 项:弹层里要加载的表单 */
  form?: { slug: string; name: string };
  /** qrcode 项:弹层展示的图片 */
  qrcodeUrl?: string;
}

/**
 * 组装可渲染的入口列表(纯函数:表单信息由调用方先查好传进来)。
 * @param formsById 表单 id → { slug, name };仅含**启用中**的表单(未启用/不存在 → 该条被丢弃)
 */
export function buildFloatingItems(
  entries: unknown,
  formsById: ReadonlyMap<number, { slug: string; name: string }>
): FloatingItem[] {
  const items: FloatingItem[] = [];
  for (const e of normalizeFloatingEntries(entries)) {
    const key = `${e.type}-${items.length}`;
    if (e.type === "tel") {
      items.push({ key, type: "tel", iconUrl: e.iconUrl, label: e.label, href: telHref(e.tel ?? "") });
    } else if (e.type === "form") {
      const form = e.formId != null ? formsById.get(e.formId) : undefined;
      if (!form) continue; // 表单被删除或停用 → 该入口自动消失,不留死链
      items.push({ key, type: "form", iconUrl: e.iconUrl, label: e.label, form });
    } else {
      items.push({
        key,
        type: "qrcode",
        iconUrl: e.iconUrl,
        label: e.label,
        qrcodeUrl: e.qrcodeUrl,
      });
    }
  }
  return items;
}
