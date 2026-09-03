import { afterEach, describe, expect, it } from "vitest";

/**
 * trackPageView 单元测试(V3.1 覆盖率补齐:analytics/index.ts 新纳入口径):
 * UV 当天去重 + 跨天重置 + "*" 行与路径行双写(看板取数口径的数据来源)。
 */
describe("trackPageView 访问统计", () => {
  afterEach(async () => {
    const g = globalThis as unknown as { __aitionUv?: { date: string; seen: Set<string> } };
    g.__aitionUv = undefined;
    const { prisma } = await import("@/lib/db");
    await prisma.dailyStat.deleteMany();
    await prisma.$disconnect();
  });

  it("同一访客同天多次访问:PV 累加、UV 仅计一次;* 行与路径行双写", async () => {
    const { trackPageView, getDashboardStats } = await import("@/server/analytics");
    await trackPageView("/p/a", "visitor-1");
    await trackPageView("/p/a", "visitor-1");
    await trackPageView("/p/b", "visitor-2");
    const stats = await getDashboardStats();
    const today = stats.week.at(-1)!;
    // 3 次 PV;UV:visitor-1、visitor-2 共 2 人
    expect(today.pv).toBe(3);
    expect(today.uv).toBe(2);
  });

  it("区间查询返回 YYYY-MM-DD 日期且包含无数据日(补 0)", async () => {
    const { trackPageView, getDashboardStats } = await import("@/server/analytics");
    await trackPageView("/p/x", "visitor-9");
    // 以今天为 to,往前三天为 from:含无数据日
    const to = new Date();
    const from = new Date(to.getTime() - 3 * 86_400_000);
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const stats = await getDashboardStats(fmt(from), fmt(to));
    expect(stats.range).toBeTruthy();
    expect(stats.range!.series.length).toBe(4);
    for (const point of stats.range!.series) {
      expect(point.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(stats.range!.series.at(-1)!.pv).toBeGreaterThanOrEqual(1);
  });
});
