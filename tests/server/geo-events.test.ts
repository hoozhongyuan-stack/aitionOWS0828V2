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
    await recordReferral("豆包", "/zh-CN/product/demo-product-gateway");
    const ev = await prisma.aIReferralEvent.findFirst({ where: { source: "豆包" } });
    expect(ev?.landing).toBe("/zh-CN/product/demo-product-gateway");
  });

  it("purgeEventsBefore:边界=明天时清空全部明细(今天的行早于明天零点)", async () => {
    const geo = await import("@/server/geo");
    const { prisma } = await import("@/lib/db");
    await geo.recordCrawl("GPTBot (OpenAI)", "/zh-CN/article/what-is-geo");
    await geo.recordReferral("豆包", "/zh-CN/product/demo-product-gateway");
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
    await geo.recordReferral("豆包", "/zh-CN/product/demo-product-gateway");
    const today = new Date();
    const f = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const res = await geo.purgeEventsBefore(f(today));
    expect(res.crawl + res.referral).toBe(0);
    expect(await prisma.aICrawlEvent.count()).toBe(1);
    expect(await prisma.aIReferralEvent.count()).toBe(1);
  });
});


describe("V4.6.4 口径分区:传统搜索白名单 + 疑似抓取启发式 + kind 过滤", () => {
  it("传统搜索爬虫识别(与 AI 白名单互斥)", async () => {
    const geo = await import("@/server/geo");
    expect(geo.matchSearchBot("Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)")).toBe("Baiduspider (百度)");
    expect(geo.matchSearchBot("Sogou web spider/4.0")).toBe("Sogou web spider (搜狗)");
    expect(geo.matchSearchBot("Mozilla/5.0 (compatible; 360Spider)")).toBe("360Spider (360 搜索)");
    expect(geo.matchSearchBot("Mozilla/5.0 (compatible; bingbot/2.0)")).toBe("Bingbot (微软 Bing)");
    // AI 爬虫不应被搜索白名单命中,反之亦然
    expect(geo.matchSearchBot("Mozilla/5.0 (compatible; GPTBot/1.0)")).toBeNull();
    expect(geo.matchBot("Mozilla/5.0 (compatible; Baiduspider/2.0)")).toBeNull();
  });

  it("传统搜索引荐识别", async () => {
    const geo = await import("@/server/geo");
    expect(geo.matchSearchReferral("https://www.baidu.com/s?wd=x")).toBe("百度搜索");
    expect(geo.matchSearchReferral("https://www.so.com/s?q=x")).toBe("360 搜索");
    expect(geo.matchSearchReferral("https://chatgpt.com/c/1")).toBeNull();
  });

  it("国内 AI 引荐白名单(V4.6.4 扩充)命中", async () => {
    const geo = await import("@/server/geo");
    expect(geo.matchReferral("https://www.tongyi.com/q/1")).toBe("通义千问");
    expect(geo.matchReferral("https://chatglm.cn/main/alltoolsdetail")).toBe("智谱清言");
    expect(geo.matchReferral("https://wenxin.baidu.com/")).toBe("文心一言");
    expect(geo.matchReferral("https://metaso.cn/search")).toBe("秘塔 AI 搜索");
    expect(geo.matchReferral("https://www.quark.cn/")).toBe("夸克");
    expect(geo.matchReferral("https://trae.cn/")).toBe("Trae");
    expect(geo.matchReferral("https://workbuddy.ai/x")).toBe("WorkBuddy");
  });

  it("AI 引荐主域兜底匹配(V4.6.7):根域与子域都命中,仿冒域不命中", async () => {
    const geo = await import("@/server/geo");
    // 用户实测缺口:此前只写 chat.deepseek.com,根域与 www 都漏记
    expect(geo.matchReferral("https://www.deepseek.com/a/chat")).toBe("DeepSeek");
    expect(geo.matchReferral("https://chat.deepseek.com/a/chat/s/1")).toBe("DeepSeek");
    // 子域覆盖:写主域一次即覆盖 www./m./chat.
    expect(geo.matchReferral("https://m.doubao.com/chat/")).toBe("豆包");
    expect(geo.matchReferral("https://www.qwen.ai/")).toBe("通义千问");
    expect(geo.matchReferral("https://www.zhipuai.cn/")).toBe("智谱清言");
    expect(geo.matchReferral("https://www.xfyun.cn/")).toBe("讯飞星火");
    expect(geo.matchReferral("https://yuanbao.tencent.com/chat/x")).toBe("腾讯元宝");
    // 边界:不以 ".域名" 结尾的仿冒/相邻域不得命中(旧子串匹配会误判)
    expect(geo.matchReferral("https://deepseek.com.evil.com/x")).toBeNull();
    expect(geo.matchReferral("https://notdeepseek.com/x")).toBeNull();
    expect(geo.matchReferral("https://www.tencent.com/")).toBeNull(); // 腾讯网 ≠ 元宝
    // 非标准 referer(无 scheme 的裸主机)退回子串兜底
    expect(geo.matchReferral("chat.deepseek.com")).toBe("DeepSeek");
    // 与搜索引擎互斥:百度系主域只归传统搜索,绝不落 AI(文心只认 wenxin/yiyan 子域)
    expect(geo.matchReferral("https://www.baidu.com/s?wd=x")).toBeNull();
    expect(geo.matchSearchReferral("https://www.baidu.com/s?wd=x")).toBe("百度搜索");
    expect(geo.matchReferral("https://wenxin.baidu.com/")).toBe("文心一言");
  });

  it("疑似抓取启发式:通用客户端 UA 命中,浏览器 UA 不命中", async () => {
    const geo = await import("@/server/geo");
    expect(geo.isGenericClient("node")).toBe(true);
    expect(geo.isGenericClient("undici")).toBe(true);
    expect(geo.isGenericClient("python-requests/2.31")).toBe(true);
    expect(geo.isGenericClient("curl/8.4.0")).toBe(true);
    expect(geo.isGenericClient("Go-http-client/1.1")).toBe(true);
    expect(geo.isGenericClient("okhttp/4.12")).toBe(true);
    expect(
      geo.isGenericClient("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36")
    ).toBe(false);
    expect(geo.isGenericClient(null)).toBe(false);
  });

  it("kind 过滤:AI 与搜索/疑似各自独立计数", async () => {
    const geo = await import("@/server/geo");
    const { prisma } = await import("@/lib/db");
    const from = "2020-01-01";
    const to = "2020-01-02";
    // 直接写三类数据(绕过时间:记录点写今天,这里用 stats 的区间参数验证过滤逻辑)
    const today = new Date();
    const d = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    await prisma.aICrawlStat.create({ data: { bot: "T_AI", date: d, path: "/t", count: 5, kind: "ai" } });
    await prisma.aICrawlStat.create({ data: { bot: "T_SEARCH", date: d, path: "/t", count: 7, kind: "search" } });
    await prisma.aICrawlStat.create({ data: { bot: "T_SUSPECT", date: d, path: "/t", count: 3, kind: "suspected" } });
    const aiStats = await geo.getGeoMonitorStats(d, d, "ai");
    const searchStats = await geo.getGeoMonitorStats(d, d, "search");
    const susStats = await geo.getGeoMonitorStats(d, d, "suspected");
    const aiBots = aiStats.trend.flatMap((t) => Object.keys(t).filter((k) => k !== "date"));
    const searchBots = searchStats.trend.flatMap((t) => Object.keys(t).filter((k) => k !== "date"));
    const susBots = susStats.trend.flatMap((t) => Object.keys(t).filter((k) => k !== "date"));
    expect(aiBots).toContain("T_AI");
    expect(aiBots).not.toContain("T_SEARCH");
    expect(searchBots).toContain("T_SEARCH");
    expect(searchBots).not.toContain("T_AI");
    expect(susBots).toContain("T_SUSPECT");
    expect(susBots).not.toContain("T_AI");
    await prisma.aICrawlStat.deleteMany({ where: { bot: { in: ["T_AI", "T_SEARCH", "T_SUSPECT"] } } });
    void from;
    void to;
  });
});

describe("独立访客口径(V4.8.2):按 渠道+日期+匿名访客标识 去重", () => {
  afterEach(async () => {
    const { prisma } = await import("@/lib/db");
    await prisma.aIReferralVisitor.deleteMany();
    await prisma.aIReferralStat.deleteMany();
    await prisma.aIReferralEvent.deleteMany();
    await prisma.$disconnect();
  });

  const today = () => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  it("同一访客当天两次到达:count 累加 2,visitors 只 +1", async () => {
    const { recordReferral } = await import("@/server/geo");
    const { prisma } = await import("@/lib/db");
    await recordReferral("DeepSeek", "/zh-CN/article/a", "ai", "visitor-aaa");
    await recordReferral("DeepSeek", "/zh-CN/article/a", "ai", "visitor-aaa");
    const row = await prisma.aIReferralStat.findFirst({ where: { source: "DeepSeek" } });
    expect(row?.count).toBe(2);
    expect(row?.visitors).toBe(1);
    expect(await prisma.aIReferralVisitor.count()).toBe(1);
  });

  it("不同访客:各自 +1(这是能对外说的独立访客数)", async () => {
    const { recordReferral } = await import("@/server/geo");
    const { prisma } = await import("@/lib/db");
    for (const v of ["v1", "v2", "v3"]) {
      await recordReferral("DeepSeek", "/zh-CN/article/a", "ai", v);
    }
    const row = await prisma.aIReferralStat.findFirst({ where: { source: "DeepSeek" } });
    expect(row?.count).toBe(3);
    expect(row?.visitors).toBe(3);
  });

  it("跨天重新计:同一访客昨日来过,今天再来仍算 1 个访客", async () => {
    const { recordReferral } = await import("@/server/geo");
    const { prisma } = await import("@/lib/db");
    const y = new Date(Date.now() - 86_400_000);
    const p = (n: number) => String(n).padStart(2, "0");
    const yesterday = `${y.getFullYear()}-${p(y.getMonth() + 1)}-${p(y.getDate())}`;
    await prisma.aIReferralVisitor.create({
      data: { source: "DeepSeek", date: yesterday, visitorId: "v-same", landing: "/old" },
    });
    await recordReferral("DeepSeek", "/zh-CN/article/a", "ai", "v-same");
    const row = await prisma.aIReferralStat.findFirst({ where: { date: today() } });
    expect(row?.visitors).toBe(1);
  });

  it("并发首访只计 1(唯一约束取代先查后写,消除竞态)", async () => {
    const { recordReferral } = await import("@/server/geo");
    const { prisma } = await import("@/lib/db");
    await Promise.all(
      Array.from({ length: 10 }, () => recordReferral("DeepSeek", "/zh-CN/article/a", "ai", "v-race"))
    );
    const row = await prisma.aIReferralStat.findFirst({ where: { source: "DeepSeek" } });
    expect(row?.count).toBe(10);
    expect(row?.visitors).toBe(1);
    expect(await prisma.aIReferralVisitor.count()).toBe(1);
  });

  it("未传访客标识(旧调用/非浏览器路径):只累加 count,不动 visitors", async () => {
    const { recordReferral } = await import("@/server/geo");
    const { prisma } = await import("@/lib/db");
    await recordReferral("豆包", "/zh-CN/article/a");
    const row = await prisma.aIReferralStat.findFirst({ where: { source: "豆包" } });
    expect(row?.count).toBe(1);
    expect(row?.visitors).toBe(0);
  });

  it("保留策略清理覆盖访客表(否则只增不减)", async () => {
    const geo = await import("@/server/geo");
    const { prisma } = await import("@/lib/db");
    await prisma.aIReferralVisitor.create({
      data: { source: "DeepSeek", date: "2020-01-01", visitorId: "old", landing: "/x" },
    });
    const res = await geo.purgeEventsBefore(today());
    expect(res.visitors).toBe(1);
    expect(await prisma.aIReferralVisitor.count()).toBe(0);
  });
});
