import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

/**
 * TEST-204(AC-006 / REQ-005):看板 API from/to 区间逐日趋势。
 * - 直接调 server 函数 getDashboardStats(from,to):序列口径(仅 path="*" 行)、
 *   date=YYYY-MM-DD、含首尾、跨度边界(日历日差 92 允许 / 93 拒绝)、
 *   未来日补 0、非法参数抛 400 语义错误、无参数结构兼容(week=近 7 天);
 * - route handler:合法区间 200;非法/单边 400 jsonErr;无参数 week 结构不变。
 *
 * route 的 requireAdmin 以 vi.mock 替换(登录墙非本测试对象,
 * 手法同 tests/server/favorite-route.test.ts)。
 */

const sessionMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn<() => Promise<{ admin: { id: number; name: string } }>>(),

  requireOwner: vi.fn<() => Promise<{ admin: { id: number; name: string } }>>(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireAdmin: sessionMocks.requireAdmin,

  requireOwner: sessionMocks.requireOwner,
}));

/** getDashboardStats 目标形态(GREEN 后签名);RED 期经此类型化调用,屏蔽旧签名差异 */
interface RangeStats {
  today: { pv: number; uv: number };
  week: { date: string; pv: number; uv: number }[];
  totals: Record<string, number>;
  range?: { from: string; to: string; series: { date: string; pv: number; uv: number }[] };
}
type GetStats = (from?: string, to?: string) => Promise<RangeStats>;
type GetRoute = (req: Request) => Promise<Response>;

let analytics: typeof import("@/server/analytics");
let route: typeof import("@/app/api/admin/dashboard/route");
let db: PrismaClient;
let getStats: GetStats;
let callGet: (query: string) => Promise<Response>;

/** 本地时区 YYYY-MM-DD(与 analytics.today() 同口径) */
function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function shiftDays(base: Date, days: number): string {
  return localDate(new Date(base.getFullYear(), base.getMonth(), base.getDate() + days));
}

beforeAll(async () => {
  analytics = await import("@/server/analytics");
  route = await import("@/app/api/admin/dashboard/route");
  db = (await import("@/lib/db")).prisma;
  getStats = analytics.getDashboardStats as unknown as GetStats;
  callGet = (query) => (route.GET as unknown as GetRoute)(new Request(`http://localhost/api/admin/dashboard${query}`));

  sessionMocks.requireAdmin.mockResolvedValue({ admin: { id: 1, name: "看板管理员" } });
  sessionMocks.requireOwner.mockResolvedValue({ admin: { id: 1, name: "看板管理员" } } as never);

  // 区间种子:2026-08-01..2026-08-10 内仅部分日期有数据;
  // 2026-08-05 故意插一行 path="/x"(具体路径),断言区间序列不计入
  await db.dailyStat.createMany({
    data: [
      { date: "2026-08-01", path: "*", pv: 10, uv: 4 },
      { date: "2026-08-05", path: "*", pv: 5, uv: 2 },
      { date: "2026-08-05", path: "/x", pv: 99, uv: 99 },
      { date: "2026-08-10", path: "*", pv: 7, uv: 3 },
    ],
  });
});

afterAll(async () => {
  await db.dailyStat.deleteMany({});
  await db.$disconnect();
});

describe("TEST-204: getDashboardStats from/to 区间查询(REQ-005)", () => {
  it("from=2026-08-01&to=2026-08-10 → 10 条逐日序列,date=YYYY-MM-DD,仅统计 path=* 行,缺日补 0", async () => {
    const stats = await getStats("2026-08-01", "2026-08-10");
    expect(stats.range).toBeDefined();
    expect(stats.range?.from).toBe("2026-08-01");
    expect(stats.range?.to).toBe("2026-08-10");
    const series = stats.range?.series ?? [];
    expect(series).toHaveLength(10);
    // 序列含首尾,逐日连续
    expect(series.map((s) => s.date)).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-08",
      "2026-08-09",
      "2026-08-10",
    ]);
    for (const s of series) expect(s.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // 仅 path="*" 全站汇总口径:/x 行的 99 不得计入
    expect(series[0]).toEqual({ date: "2026-08-01", pv: 10, uv: 4 });
    expect(series[4]).toEqual({ date: "2026-08-05", pv: 5, uv: 2 });
    expect(series[9]).toEqual({ date: "2026-08-10", pv: 7, uv: 3 });
    // 无数据日补 0
    expect(series[1]).toEqual({ date: "2026-08-02", pv: 0, uv: 0 });
  });

  it("跨度边界:日历日差 92 天允许(序列 93 条),93 天拒绝 400", async () => {
    const ok = await getStats("2026-05-01", "2026-08-01"); // 差 92 天
    expect(ok.range?.series).toHaveLength(93);
    await expect(getStats("2026-04-30", "2026-08-01")).rejects.toMatchObject({ status: 400 });
  });

  it("from>to / 非法格式 / 单边参数 → 400 语义错误", async () => {
    const bad: [string | undefined, string | undefined][] = [
      ["2026-08-10", "2026-08-01"], // from>to
      ["2026-8-1", "2026-08-10"], // 非 0 填充
      ["2026/08/01", "2026-08-10"], // 斜杠格式
      ["2026-02-30", "2026-08-10"], // 不存在的日期
      ["not-a-date", "2026-08-10"], // 任意非日期
      ["2026-08-01", undefined], // 只传 from
      [undefined, "2026-08-10"], // 只传 to
    ];
    for (const [from, to] of bad) {
      await expect(getStats(from, to)).rejects.toMatchObject({ status: 400 });
    }
  });

  it("to 为未来日期:序列含未来日且值为 0", async () => {
    const now = new Date();
    const from = shiftDays(now, -1);
    const to = shiftDays(now, 3);
    const stats = await getStats(from, to);
    const series = stats.range?.series ?? [];
    expect(series).toHaveLength(5);
    expect(series[0]?.date).toBe(from);
    expect(series[4]).toEqual({ date: to, pv: 0, uv: 0 }); // 未来日补 0
    expect(series[3]).toEqual({ date: shiftDays(now, 2), pv: 0, uv: 0 });
  });

  it("无参数:结构完全兼容(week=近 7 天,today/totals 保留,无 range)", async () => {
    const stats = await getStats();
    expect(stats.week).toHaveLength(7);
    expect(stats.today).toEqual({ pv: 0, uv: 0 });
    expect(stats.totals).toBeDefined();
    expect(stats.range).toBeUndefined();
  });
});

describe("TEST-204: GET /api/admin/dashboard from/to 路由", () => {
  it("合法区间 → 200,ok=true,data.range.series 10 条", async () => {
    const res = await callGet("?from=2026-08-01&to=2026-08-10");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: RangeStats };
    expect(body.ok).toBe(true);
    expect(body.data.range?.series).toHaveLength(10);
    expect(body.data.range?.series[4]).toEqual({ date: "2026-08-05", pv: 5, uv: 2 });
  });

  it("非法参数 → 400 jsonErr(from>to / 跨度 93 / 只传 from / 非法格式)", async () => {
    for (const query of [
      "?from=2026-08-10&to=2026-08-01",
      "?from=2026-04-30&to=2026-08-01",
      "?from=2026-08-01",
      "?to=2026-08-10",
      "?from=2026/08/01&to=2026-08-10",
    ]) {
      const res = await callGet(query);
      expect(res.status, query).toBe(400);
      const body = (await res.json()) as { ok: boolean; message: string };
      expect(body.ok, query).toBe(false);
      expect(body.message, query).toBeTruthy();
    }
  });

  it("无参数 → 200 且结构兼容(week 7 条,today/totals 在,range 缺省)", async () => {
    const res = await callGet("");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: RangeStats };
    expect(body.ok).toBe(true);
    expect(body.data.week).toHaveLength(7);
    expect(body.data.today).toEqual({ pv: 0, uv: 0 });
    expect(body.data.totals).toBeDefined();
    expect(body.data.range).toBeUndefined();
  });
});
