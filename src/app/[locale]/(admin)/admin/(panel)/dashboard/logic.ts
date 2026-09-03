/**
 * 数据看板筛选的纯逻辑(V3.1 REQ-006;可被 vitest node 环境直接导入测试)。
 *
 * 环境约定同 (site)/account/logic.ts:本仓库 vitest 为 node 环境,
 * 客户端组件 page.tsx 无法导入,「预设档 → from/to 计算」「自定义区间校验」
 * 「查询串构造」「趋势序列选择」等纯函数一律收敛在本 .ts 文件。
 *
 * 口径与 server REQ-005 对齐:from/to 必须成对、YYYY-MM-DD(本地时区)、
 * 跨度 = to−from 日历日差 ≤ 92。
 */

export type RangePresetDays = 7 | 30 | 90;

/** 预设档(REQ-006):近 7 / 30 / 90 天 */
export const PRESET_DAYS: readonly RangePresetDays[] = [7, 30, 90];

/** 跨度上限(与 REQ-005 服务端口径一致:from/to 日历日差 ≤ 92) */
export const MAX_RANGE_SPAN_DAYS = 92;

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** 本地时区 Date → YYYY-MM-DD */
export function toDateString(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** YYYY-MM-DD + 天数偏移(可负)→ YYYY-MM-DD(本地时区,自动跨月/跨年) */
export function shiftDays(dateStr: string, days: number): string {
  const base = new Date(`${dateStr}T00:00:00`);
  return toDateString(new Date(base.getFullYear(), base.getMonth(), base.getDate() + days));
}

/** 预设档 → 区间:to=今天,from=今天−(days−1)(含首尾共 days 天) */
export function presetRange(days: RangePresetDays, now: Date = new Date()): DateRange {
  const to = toDateString(now);
  return { from: shiftDays(to, -(days - 1)), to };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 严格 YYYY-MM-DD 且为真实日历日(拒绝 2026-8-1 / 2026-02-30 等) */
export function isValidDateString(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00`);
  return !Number.isNaN(d.getTime()) && toDateString(d) === value;
}

/** 两个 YYYY-MM-DD 之间的日历日差(to − from) */
function diffCalendarDays(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00`) - Date.parse(`${from}T00:00:00`);
  return Math.round(ms / 86_400_000);
}

/**
 * 自定义起止 → 区间;任一端为空/格式非法/from>to/跨度超上限 → null
 * (返回 null 时由调用方提示,不发请求)
 */
export function resolveCustomRange(
  fromRaw: string | null,
  toRaw: string | null
): DateRange | null {
  const from = fromRaw?.trim() ?? "";
  const to = toRaw?.trim() ?? "";
  if (!from || !to || !isValidDateString(from) || !isValidDateString(to)) return null;
  const diff = diffCalendarDays(from, to);
  if (diff < 0 || diff > MAX_RANGE_SPAN_DAYS) return null;
  return { from, to };
}

/** 区间 → 看板 API 查询串(GET /api/admin/dashboard?from=&to=) */
export function dashboardRangeQuery(range: DateRange): string {
  const q = new URLSearchParams({ from: range.from, to: range.to });
  return `/api/admin/dashboard?${q.toString()}`;
}

export interface TrendPoint {
  date: string; // 区间流=YYYY-MM-DD;兼容回退(week 旧结构)=MM-DD
  pv: number;
  uv: number;
}

/**
 * 图表数据选择:有 range(预设/自定义区间流,形态同 API 响应)用 range.series
 * (date=YYYY-MM-DD);无 range(无参数旧结构)回退 week,保证响应结构兼容(REQ-005)。
 */
export function resolveTrendSeries(stats: {
  week: TrendPoint[];
  range?: { from: string; to: string; series: TrendPoint[] } | null;
}): TrendPoint[] {
  return stats.range?.series ?? stats.week;
}
