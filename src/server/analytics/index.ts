import { prisma } from "@/lib/db";

/**
 * 轻量访问统计(需求 5 看板):按天聚合 PV/UV,'*' 行为全站汇总。
 * UV 以客户端持久化 visitorId 为准(当天首次访问计 1)。
 * V3.1(REQ-005):getDashboardStats 支持可选 from/to 区间逐日查询。
 */

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 当天已计 UV 的访客集合(进程内存;跨天自动重建)
const g = globalThis as unknown as { __aitionUv?: { date: string; seen: Set<string> } };

/** 校验失败 / 参数非法的语义错误(路由层映射 HTTP 400,沿 FavoriteTargetNotFoundError 模式) */
export class DashboardRangeError extends Error {
  readonly status = 400;
  constructor(message = "看板时间区间参数非法") {
    super(message);
    this.name = "DashboardRangeError";
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 严格校验 YYYY-MM-DD 且为真实存在的日历日(拒绝 2026-02-30) */
function parseIsoDate(value: string): Date | null {
  if (!DATE_RE.test(value)) return null;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  // 往返一致性:本地时区下重新格式化必须与输入相同(排除 2026-02-30 这类滚动日期)
  return localDate(d) === value ? d : null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** 本地时区 YYYY-MM-DD */
function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 两个 YYYY-MM-DD 之间的日历日差(to - from) */
function diffCalendarDays(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00`) - Date.parse(`${from}T00:00:00`);
  return Math.round(ms / 86_400_000);
}

/**
 * 成对区间参数校验(REQ-005):
 * - 双缺省 → null(维持无参口径:week=近 7 天);
 * - 单边出现 / 非法格式 / from>to / 跨度(日历日差)>92 → DashboardRangeError(400)。
 */
function validateRange(from?: string, to?: string): { from: string; to: string } | null {
  if (!from && !to) return null;
  if (!from || !to) throw new DashboardRangeError("from/to 必须成对出现");
  if (!parseIsoDate(from) || !parseIsoDate(to)) {
    throw new DashboardRangeError("日期格式非法,应为 YYYY-MM-DD(如 2026-08-01)");
  }
  const diff = diffCalendarDays(from, to);
  if (diff < 0) throw new DashboardRangeError("from 不能晚于 to");
  if (diff > 92) throw new DashboardRangeError("区间跨度不能超过 92 天(to−from 日历日差≤92)");
  return { from, to };
}

/** 记录一次页面访问 */
export async function trackPageView(path: string, visitorId: string): Promise<void> {
  const date = today();
  if (!g.__aitionUv || g.__aitionUv.date !== date) {
    g.__aitionUv = { date, seen: new Set() };
  }
  const isNewVisitor = !g.__aitionUv.seen.has(visitorId);
  if (isNewVisitor) g.__aitionUv.seen.add(visitorId);

  const uvInc = isNewVisitor ? 1 : 0;
  // 全站汇总行 + 具体路径行
  for (const p of ["*", path.slice(0, 200)]) {
    await prisma.dailyStat.upsert({
      where: { date_path: { date, path: p } },
      update: { pv: { increment: 1 }, ...(uvInc ? { uv: { increment: 1 } } : {}) },
      create: { date, path: p, pv: 1, uv: uvInc },
    });
  }
}

/**
 * 看板数据:今日/近 7 天趋势 + 业务总量。
 * V3.1(REQ-005):传入 from/to(成对,YYYY-MM-DD)时额外返回 range:
 *   { from, to, series } —— 仅取 path="*" 全站汇总行,序列含首尾逐日连续,
 *   date 输出 YYYY-MM-DD,无数据日(含 to 晚于今天的未来日)补 0。
 * 无参数时返回值结构与既有契约完全兼容(today/week/totals,无 range)。
 */
export async function getDashboardStats(from?: string, to?: string) {
  const date = today();
  const range = validateRange(from, to);

  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600_000);
    days.push(localDate(d));
  }

  const [todayRow, weekRows, contentCount, userCount, pendingComments, pendingSubmissions, formCount, submissionTotal] =
    await Promise.all([
      prisma.dailyStat.findUnique({ where: { date_path: { date, path: "*" } } }),
      prisma.dailyStat.findMany({ where: { path: "*", date: { in: days } } }),
      prisma.content.count({ where: { status: "PUBLISHED" } }),
      prisma.user.count(),
      prisma.comment.count({ where: { status: "PENDING" } }),
      prisma.content.count({ where: { source: "UGC", status: "PENDING" } }),
      prisma.form.count(),
      prisma.formSubmission.count(),
    ]);

  const byDate = new Map(weekRows.map((r) => [r.date, r]));
  const base = {
    today: { pv: todayRow?.pv ?? 0, uv: todayRow?.uv ?? 0 },
    week: days.map((d) => ({ date: d.slice(5), pv: byDate.get(d)?.pv ?? 0, uv: byDate.get(d)?.uv ?? 0 })),
    totals: {
      contents: contentCount,
      users: userCount,
      pendingComments,
      pendingSubmissions,
      forms: formCount,
      formSubmissions: submissionTotal,
    },
  };
  if (!range) return base;

  // 区间序列(REQ-005):仅 path="*",YYYY-MM-DD 字符串可直接按字典序比较
  const total = diffCalendarDays(range.from, range.to) + 1; // 含首尾
  const rangeDates: string[] = [];
  // 日历日滚动(而非毫秒推进):避免午夜切换 DST 的时区出现重复/跳日
  const [y, m, d] = range.from.split("-").map(Number);
  for (let i = 0; i < total; i++) {
    rangeDates.push(localDate(new Date(y, m - 1, d + i)));
  }
  const rows = await prisma.dailyStat.findMany({
    where: { path: "*", date: { gte: range.from, lte: range.to } },
  });
  const rangeByDate = new Map(rows.map((r) => [r.date, r]));

  return {
    ...base,
    range: {
      from: range.from,
      to: range.to,
      series: rangeDates.map((d) => ({
        date: d,
        pv: rangeByDate.get(d)?.pv ?? 0,
        uv: rangeByDate.get(d)?.uv ?? 0,
      })),
    },
  };
}
