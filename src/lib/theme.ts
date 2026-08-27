import type { ThemeConfig } from "@/lib/config";

/**
 * 主题注入工具:把后台配置转换为 shadcn 所需的 CSS 变量。
 * 支持两种颜色格式:
 *   - hex(#0f172a,后台调色板输出)→ 转 HSL 三元组
 *   - HSL 三元组("222.2 47.4% 11.2%",历史/高级用法)→ 原样透传
 */

/** hex → HSL 三元组("h s% l%") */
export function hexToHslTriplet(hex: string): string | null {
  const m = hex.trim().match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  const round = (x: number) => Math.round(x * 10) / 10;
  return `${round(h * 360)} ${round(s * 100)}% ${round(l * 100)}%`;
}

/** 合法颜色(hex 或 HSL 三元组);非法输入一律视为脏数据返回 fallback */
const COLOR_OK = /^(#[0-9a-fA-F]{6}|[0-9]{1,3}(\.[0-9]+)? [0-9]{1,3}(\.[0-9]+)?% [0-9]{1,3}(\.[0-9]+)?%)$/;
const UNIT_OK = /^[0-9]{1,4}(\.[0-9]+)?(px|rem|em|%)?$/;
const PX_OK = /^[0-9]{1,4}(\.[0-9]+)?px$/;
const NUMBER_OK = /^[0-9](\.[0-9]+)?$/;
// 字体栈剔除可断开 CSS/HTML 的字符;theme 值最终进 <style>,这是注入逃逸的最后防线
const FONT_BAD = /[<>{};\\`]/;

function safeUnit(v: string | undefined, fallback: string, ok: RegExp): string {
  const s = (v ?? "").trim();
  return s && s.length <= 200 && !FONT_BAD.test(s) && ok.test(s) ? s : fallback;
}

/** 任意配置颜色 → HSL 三元组(非法输入返回 fallback) */
function toTriplet(value: string, fallback: string): string {
  if (!value) return fallback;
  if (value.startsWith("#")) return hexToHslTriplet(value) ?? fallback;
  return COLOR_OK.test(value.trim()) ? value.trim() : fallback;
}

/** 由 HSL 三元组的亮度决定配文颜色(亮底配深字、深底配白字) */
function foregroundFor(triplet: string): string {
  const l = parseFloat(triplet.split(" ")[2] ?? "50");
  return l > 55 ? "222.2 47.4% 11.2%" : "210 40% 98%";
}

/** 调整 HSL 三元组亮度(delta 为百分点,可负) */
function shiftL(triplet: string, delta: number): string {
  const parts = triplet.split(" ");
  const l = Math.min(98, Math.max(2, parseFloat(parts[2] ?? "50") + delta));
  return `${parts[0]} ${parts[1]} ${l}%`;
}

/**
 * 生成注入 <head> 的完整 CSS。
 * 覆盖 globals.css 中的默认值;衍生色(border/muted 等)按规则自动计算,
 * 客户只需配 5 个主颜色即可获得全局一致的视觉。
 */
export function buildThemeCss(theme: ThemeConfig): string {
  const primary = toTriplet(theme.primary, "222.2 47.4% 11.2%");
  const secondary = toTriplet(theme.secondary, "210 40% 96.1%");
  const background = toTriplet(theme.background, "0 0% 100%");
  const foreground = toTriplet(theme.foreground, "222.2 84% 4.9%");
  // 次要/静音文字色(测试反馈:面包屑、日期、表格内容、输入框占位文字等全站大量使用
  // --muted-foreground,过去它是从 foreground 派生亮度得到,色相跟着 foreground 走,
  // foreground 只要带一点蓝就会导致满屏"发蓝"。现在改为完全独立的配置项,
  // 默认给回 shadcn 原生的中性灰(与 globals.css 兜底值一致),不再受 foreground 色相影响。
  const mutedText = toTriplet(theme.mutedTextColor, "215.4 16.3% 46.9%");

  const vars = [
    `--primary:${primary}`,
    `--primary-foreground:${foregroundFor(primary)}`,
    `--secondary:${secondary}`,
    `--secondary-foreground:${foregroundFor(secondary)}`,
    `--background:${background}`,
    `--foreground:${foreground}`,
    `--card:${background}`,
    `--card-foreground:${foreground}`,
    `--popover:${background}`,
    `--popover-foreground:${foreground}`,
    `--muted:${secondary}`,
    `--muted-foreground:${mutedText}`,
    `--accent:${secondary}`,
    `--accent-foreground:${foregroundFor(secondary)}`,
    `--border:${shiftL(secondary, -5)}`,
    `--input:${shiftL(secondary, -5)}`,
    `--ring:${primary}`,
    `--radius:${safeUnit(theme.radius, "0.5rem", UNIT_OK)}`,
    `--font-sans:${safeUnit(theme.fontSans, "system-ui, sans-serif", FONT_OK_FONT)}`,
    `--font-heading:${safeUnit(theme.fontHeading, "var(--font-sans)", FONT_OK_FONT)}`,
  ].join(";");

  return `:root{${vars}}html{font-size:${safeUnit(theme.fontSize, "16px", PX_OK)}}body{line-height:${safeUnit(theme.lineHeight, "1.6", NUMBER_OK)}}`;
}

// 字体栈与颜色/长度走不同校验:允许逗号、引号、百分号,只挡危险字符
const FONT_OK_FONT = /^[^<>{};\\`]{0,200}$/;
