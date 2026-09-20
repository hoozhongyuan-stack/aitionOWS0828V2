import { afterEach, describe, expect, it } from "vitest";

/**
 * GEO 监测服务(V3.2):AI 爬虫识别/引荐识别/记录累加/聚合查询。
 * 数据落在真实临时库(tests/setup/db.ts),用例间清理。
 */
describe("GEO 监测服务", () => {
  afterEach(async () => {
    const { prisma } = await import("@/lib/db");
    await prisma.aICrawlStat.deleteMany();
    await prisma.aIReferralStat.deleteMany();
    await prisma.$disconnect();
  });

  it("matchBot:识别白名单内 AI 爬虫,非白名单返回 null", async () => {
    const { matchBot } = await import("@/server/geo");
    expect(matchBot("Mozilla/5.0 (compatible; GPTBot/1.1)")).toBe("GPTBot (OpenAI)");
    expect(matchBot("Mozilla/5.0 (compatible; Bytespider; spider@sogou.com)")).toBe(
      "Bytespider (字节·豆包)"
    );
    expect(matchBot("PerplexityBot/1.0")).toContain("Perplexity");
    expect(matchBot("Mozilla/5.0 (Macintosh) Chrome/120")).toBeNull();
    expect(matchBot(null)).toBeNull();
  });

  it("matchReferral:识别 AI 渠道 referer,非渠道返回 null", async () => {
    const { matchReferral } = await import("@/server/geo");
    expect(matchReferral("https://chatgpt.com/c/abc")).toBe("ChatGPT");
    expect(matchReferral("https://www.doubao.com/share/xyz")).toBe("豆包");
    expect(matchReferral("https://www.google.com/search?q=x")).toBeNull();
    expect(matchReferral("")).toBeNull();
  });

  it("recordCrawl:同引擎同天同路径累加,不同路径分行", async () => {
    const { recordCrawl, getGeoMonitorStats } = await import("@/server/geo");
    await recordCrawl("GPTBot (OpenAI)", "/zh-CN/article/what-is-geo");
    await recordCrawl("GPTBot (OpenAI)", "/zh-CN/article/what-is-geo");
    await recordCrawl("GPTBot (OpenAI)", "/zh-CN/product/demo-product-gateway");
    const today = new Date();
    const fmt = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const stats = await getGeoMonitorStats(fmt, fmt);
    const gpt = stats.trend.find((t: Record<string, unknown>) => t.date === fmt) as Record<string, number> | undefined;
    expect(gpt?.["GPTBot (OpenAI)"]).toBe(3); // 2 次 what-is-geo + 1 次 gateway(按引擎聚合)
    expect(stats.topPages.length).toBeGreaterThanOrEqual(2);
  });

  it("getGeoMonitorStats:引荐表返回来源/落地/次数/独立访客", async () => {
    const { recordReferral, getGeoMonitorStats } = await import("@/server/geo");
    // V4.8.2:独立访客按 渠道+日期+匿名访客标识 去重 —— 同访客两次到达只计 1 个访客
    await recordReferral("豆包", "/zh-CN/product/demo-product-gateway", "ai", "vm-1");
    await recordReferral("豆包", "/zh-CN/product/demo-product-gateway", "ai", "vm-1");
    await recordReferral("豆包", "/zh-CN/product/demo-product-gateway", "ai", "vm-2");
    const today = new Date();
    const fmt = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const stats = await getGeoMonitorStats(fmt, fmt);
    const row = stats.referrals.find((r: { source: string }) => r.source === "豆包");
    expect(row?.count).toBe(3);
    expect(row?.visitors).toBe(2); // 两个不同访客
    expect(row?.landing).toBe("/zh-CN/product/demo-product-gateway");
  });
});
