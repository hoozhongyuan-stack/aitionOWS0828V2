import { afterEach, describe, expect, it } from "vitest";

/**
 * GEO 明细层(V3.2.1):双写明细、查询筛选、CSV 数据源、保留清理。
 * 数据落真实临时库(tests/setup/db.ts),用例间清理。
 */
describe("GEO 明细层", () => {
  afterEach(async () => {
    const { prisma } = await import("@/lib/db");
    await prisma.aICrawlEvent.deleteMany();
    await prisma.aIReferralEvent.deleteMany();
    await prisma.aICrawlStat.deleteMany();
    await prisma.aIReferralStat.deleteMany();
    await prisma.$disconnect();
  });

  it("recordCrawl 双写:聚合累加 + 明细行含 UA 与秒级时间", async () => {
    const { recordCrawl } = await import("@/server/geo");
    const { prisma } = await import("@/lib/db");
    await recordCrawl("GPTBot (OpenAI)", "/zh-CN/article/what-is-geo", "GPTBot/1.1 UA");
    const ev = await prisma.aICrawlEvent.findFirst({ where: { bot: "GPTBot (OpenAI)" } });
    expect(ev).toBeTruthy();
    expect(ev!.path).toBe("/zh-CN/article/what-is-geo");
    expect(ev!.ua).toContain("GPTBot/1.1");
    expect(ev!.ts instanceof Date || typeof ev!.ts === "string").toBe(true);
  });

  it("listCrawlEvents:时间范围+路径关键字筛选+分页", async () => {
    const { recordCrawl } = await import("@/server/geo");
    for (let i = 0; i < 3; i++) {
      await recordCrawl("GPTBot (OpenAI)", `/zh-CN/article/post-${i}`);
    }
    await recordCrawl("Bytespider (字节·豆包)", "/zh-CN/article/post-x");
    const { listCrawlEvents } = await import("@/server/geo");
    const all = await listCrawlEvents({ pageSize: 10 });
    expect(all.total).toBeGreaterThanOrEqual(4);
    const filtered = await listCrawlEvents({ pathLike: "post-1", pageSize: 10 });
    expect(filtered.items.every((i: { path: string }) => i.path.includes("post-1"))).toBe(true);
    const paged = await listCrawlEvents({ page: 1, pageSize: 2 });
    expect(paged.items.length).toBeLessThanOrEqual(2);
  });

  it("recordReferral 双写:引荐明细含渠道与落地页", async () => {
    const { recordReferral } = await import("@/server/geo");
    const { prisma } = await import("@/lib/db");
    await recordReferral("豆包", "/zh-CN/product/demo-product-gateway", true);
    const ev = await prisma.aIReferralEvent.findFirst({ where: { source: "豆包" } });
    expect(ev?.landing).toBe("/zh-CN/product/demo-product-gateway");
  });

  it("purgeEventsBefore:边界=明天时清空全部明细(今天的行早于明天零点)", async () => {
    const geo = await import("@/server/geo");
    const { prisma } = await import("@/lib/db");
    await geo.recordCrawl("GPTBot (OpenAI)", "/zh-CN/article/what-is-geo");
    await geo.recordReferral("豆包", "/zh-CN/product/demo-product-gateway", true);
    const tomorrow = new Date(Date.now() + 86_400_000);
    const f = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const res = await geo.purgeEventsBefore(f(tomorrow));
    expect(res.crawl).toBe(1);
    expect(res.referral).toBe(1);
    expect(await prisma.aICrawlEvent.count()).toBe(0);
    expect(await prisma.aIReferralEvent.count()).toBe(0);
  });

  it("purgeEventsBefore:边界=今天时保留今天的明细(仅清理更早的)", async () => {
    const geo = await import("@/server/geo");
    const { prisma } = await import("@/lib/db");
    await geo.recordCrawl("GPTBot (OpenAI)", "/zh-CN/article/what-is-geo");
    await geo.recordReferral("豆包", "/zh-CN/product/demo-product-gateway", true);
    const today = new Date();
    const f = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const res = await geo.purgeEventsBefore(f(today));
    expect(res.crawl + res.referral).toBe(0);
    expect(await prisma.aICrawlEvent.count()).toBe(1);
    expect(await prisma.aIReferralEvent.count()).toBe(1);
  });
});

