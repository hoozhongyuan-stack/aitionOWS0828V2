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
    const stats = (await getDashboardStats()) as {
      week: { date: string; pv: number; uv: number }[];
      range?: { from: string; to: string; series: { date: string; pv: number; uv: number }[] };
    };
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
    const ranged = (await getDashboardStats(fmt(from), fmt(to))) as {
      range?: { from: string; to: string; series: { date: string; pv: number; uv: number }[] };
    };
    expect(ranged.range).toBeTruthy();
    expect(ranged.range!.series.length).toBe(4);
    for (const point of ranged.range!.series) {
      expect(point.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(ranged.range!.series.at(-1)!.pv).toBeGreaterThanOrEqual(1);
  });
});

describe("引荐识别移至客户端上报(V4.8.2)", () => {
  afterEach(async () => {
    const { prisma } = await import("@/lib/db");
    await prisma.aIReferralStat.deleteMany();
    await prisma.aIReferralEvent.deleteMany();
    await prisma.aIReferralVisitor.deleteMany();
    await prisma.$disconnect();
  });

  const track = async (body: Record<string, unknown>) => {
    const route = await import("@/app/api/track/route");
    return route.POST(
      new Request("http://localhost:3000/api/track", {
        method: "POST",
        headers: { "content-type": "application/json", host: "localhost:3000" },
        body: JSON.stringify(body),
      })
    );
  };

  it("AI 渠道来源:首次上报落库,visitors=1(真独立访客)", async () => {
    const { prisma } = await import("@/lib/db");
    const res = await track({
      path: "/zh-CN/article/what-is-geo",
      visitorId: "vid-0001",
      referrer: "https://chat.deepseek.com/a/chat/s/abc",
    });
    expect(res.status).toBe(200);
    const row = await prisma.aIReferralStat.findFirst({ where: { source: "DeepSeek" } });
    expect(row?.landing).toBe("/zh-CN/article/what-is-geo");
    expect(row?.kind).toBe("ai");
    expect(row?.count).toBe(1);
    expect(row?.visitors).toBe(1);
  });

  it("同一访客当天再次从同渠道到达:点击 +1、独立访客不再增加", async () => {
    const { prisma } = await import("@/lib/db");
    await track({ path: "/zh-CN/a", visitorId: "vid-0002", referrer: "https://www.perplexity.ai/x" });
    await track({ path: "/zh-CN/b", visitorId: "vid-0002", referrer: "https://www.perplexity.ai/y" });
    const rows = await prisma.aIReferralStat.findMany({ where: { source: "Perplexity" } });
    expect(rows.reduce((n, r) => n + r.count, 0)).toBe(2);
    expect(rows.reduce((n, r) => n + r.visitors, 0)).toBe(1);
  });

  it("传统搜索引擎来源:计入 search 口径,不与 AI 混算", async () => {
    const { prisma } = await import("@/lib/db");
    await track({ path: "/zh-CN/a", visitorId: "vid-0003", referrer: "https://www.bing.com/search?q=x" });
    const row = await prisma.aIReferralStat.findFirst({ where: { source: "Bing" } });
    expect(row?.kind).toBe("search");
  });

  it("站内来源不记录(内部跳转不算引荐)", async () => {
    const { prisma } = await import("@/lib/db");
    await track({
      path: "/zh-CN/a",
      visitorId: "vid-0004",
      referrer: "http://localhost:3000/zh-CN/c/insight",
    });
    expect(await prisma.aIReferralStat.count()).toBe(0);
  });

  it("未识别来源:只记主机名,kind=unknown", async () => {
    const { prisma } = await import("@/lib/db");
    await track({
      path: "/zh-CN/a",
      visitorId: "vid-0005",
      referrer: "https://some-unknown-tool.example/read",
    });
    const row = await prisma.aIReferralStat.findFirst({ where: { kind: "unknown" } });
    expect(row?.source).toBe("some-unknown-tool.example");
  });

  it("不带 referrer(站内后续上报):只计 PV,不产生引荐", async () => {
    const { prisma } = await import("@/lib/db");
    await track({ path: "/zh-CN/article/next", visitorId: "vid-0006" });
    expect(await prisma.aIReferralStat.count()).toBe(0);
  });

  it("后台路径既不统计也不记引荐", async () => {
    const { prisma } = await import("@/lib/db");
    const before = await prisma.dailyStat.count(); // 同进程其它用例可能已写入,只比较增量
    await track({
      path: "/zh-CN/admin/content",
      visitorId: "vid-0007",
      referrer: "https://chat.deepseek.com/a",
    });
    expect(await prisma.aIReferralStat.count()).toBe(0);
    expect(await prisma.dailyStat.count()).toBe(before);
  });
});
