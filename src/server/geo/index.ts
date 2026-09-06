import { prisma } from "@/lib/db";

/**
 * GEO 监测服务(V3.2 一期):AI 爬虫与 AI 渠道引荐的自控数据监测。
 *
 * 数据链路(可见/可监控/说得上来渠道与时间):
 *   1) 爬虫抓取 —— [locale]/layout 读 UA 匹配白名单 → recordCrawl(异步不阻塞渲染)
 *   2) AI 引荐 —— 同处读 referer 匹配渠道白名单 → recordReferral
 *   3) 后台 GEO 监测页 —— getCrawlTrend / getTopCrawledPages / getReferralTable
 *
 * 口径:
 *   - date 为服务器时区 YYYY-MM-DD(与 DailyStat/week 口径一致)
 *   - 爬虫/引荐计数 upsert 累加;引用通知无行业标准,二期探测补充
 */

/** 已知 AI 爬虫 UA 关键字 → 引擎显示名(小写包含匹配) */
export const AI_BOTS: ReadonlyArray<{ match: string; name: string }> = [
  { match: "gptbot", name: "GPTBot (OpenAI)" },
  { match: "oai-searchbot", name: "OAI-SearchBot (OpenAI 检索)" },
  { match: "chatgpt-user", name: "ChatGPT-User (OpenAI 用户触发)" },
  { match: "perplexitybot", name: "PerplexityBot" },
  { match: "perplexity-user", name: "Perplexity-User" },
  { match: "claudebot", name: "ClaudeBot (Anthropic)" },
  { match: "claude-user", name: "Claude-User (Anthropic 用户触发)" },
  { match: "google-extended", name: "Google-Extended (Gemini 训练)" },
  { match: "googleother", name: "GoogleOther" },
  { match: "applebot-extended", name: "Applebot-Extended (Apple 智能)" },
  { match: "bytespider", name: "Bytespider (字节·豆包)" },
  { match: "deepseekbot", name: "DeepSeekBot" },
];

/** AI 引荐渠道:referer host 关键字 → 渠道显示名 */
export const AI_REFERRERS: ReadonlyArray<{ match: string; name: string }> = [
  { match: "chatgpt.com", name: "ChatGPT" },
  { match: "perplexity.ai", name: "Perplexity" },
  { match: "doubao.com", name: "豆包" },
  { match: "yuanbao.tencent.com", name: "腾讯元宝" },
  { match: "grok.com", name: "Grok" },
  { match: "copilot.microsoft.com", name: "Copilot" },
  { match: "gemini.google.com", name: "Gemini" },
  { match: "kimi.moonshot.cn", name: "Kimi" },
];

/** UA → 引擎名;非 AI 爬虫返回 null */
export function matchBot(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const lower = ua.toLowerCase();
  for (const b of AI_BOTS) {
    if (lower.includes(b.match)) return b.name;
  }
  return null;
}

/** referer → 渠道名;非 AI 渠道返回 null */
export function matchReferral(referer: string | null | undefined): string | null {
  if (!referer) return null;
  const lower = referer.toLowerCase();
  for (const r of AI_REFERRERS) {
    if (lower.includes(r.match)) return r.name;
  }
  return null;
}

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 记录一次 AI 爬虫抓取(按 引擎+日期+路径 upsert 累加);失败静默不阻断渲染 */
export async function recordCrawl(bot: string, path: string, ua?: string): Promise<void> {
  const p = path.slice(0, 200) || "/";
  try {
    // 聚合(趋势/Top 高效) + 明细(下钻搜索) 双写;明细保留 180 天(清理见 listRetentionNote)
    await prisma.$transaction([
      prisma.aICrawlStat.upsert({
        where: { bot_date_path: { bot, date: today(), path: p } },
        update: { count: { increment: 1 } },
        create: { bot, date: today(), path: p, count: 1 },
      }),
      prisma.aICrawlEvent.create({ data: { bot, path: p, ua: ua?.slice(0, 300) } }),
    ]);
  } catch (e) {
    console.error("[geo] 爬虫记录失败:", e);
  }
}

/** 记录一次 AI 渠道引荐(渠道+落地页+日期 upsert 累加,访客按会话级去重由调用方传入) */
export async function recordReferral(source: string, landing: string, isNewVisitor: boolean): Promise<void> {
  const p = landing.slice(0, 200) || "/";
  try {
    // 聚合 + 明细 双写(引荐点击事件秒级留痕)
    await prisma.$transaction([
      prisma.aIReferralStat.upsert({
        where: { source_landing_date: { source, landing: p, date: today() } },
        update: {
          count: { increment: 1 },
          ...(isNewVisitor ? { visitors: { increment: 1 } } : {}),
        },
        create: { source, landing: p, date: today(), count: 1, visitors: 1 },
      }),
      prisma.aIReferralEvent.create({ data: { source, landing: p } }),
    ]);
  } catch (e) {
    console.error("[geo] 引荐记录失败:", e);
  }
}

/** 后台 GEO 监测聚合:趋势/Top 页面/引荐表(from/to 为 YYYY-MM-DD,默认近 7 天) */
export async function getGeoMonitorStats(from: string, to: string) {
  const [crawlTrend, topPages, referrals] = await Promise.all([
    prisma.aICrawlStat.groupBy({
      by: ["date", "bot"],
      where: { date: { gte: from, lte: to } },
      _sum: { count: true },
      orderBy: { date: "asc" },
    }),
    prisma.aICrawlStat.groupBy({
      by: ["path", "bot"],
      where: { date: { gte: from, lte: to } },
      _sum: { count: true },
      orderBy: { _sum: { count: "desc" } },
      take: 10,
    }),
    prisma.aIReferralStat.groupBy({
      by: ["source", "landing"],
      where: { date: { gte: from, lte: to } },
      _sum: { count: true, visitors: true },
      orderBy: { _sum: { count: "desc" } },
      take: 10,
    }),
  ]);

  const byEngine = new Map<string, Map<string, number>>();
  for (const row of crawlTrend) {
    if (!byEngine.has(row.bot)) byEngine.set(row.bot, new Map());
    byEngine.get(row.bot)!.set(row.date, row._sum.count ?? 0);
  }
  const dates = [...new Set(crawlTrend.map((r) => r.date))].sort();
  const trend = dates.map((date) => {
    const point: Record<string, string | number> = { date };
    for (const [bot, m] of byEngine) point[bot] = m.get(date) ?? 0;
    return point;
  });

  return {
    from,
    to,
    trend,
    topPages: topPages.map((r) => ({ path: r.path, bot: r.bot, count: r._sum.count ?? 0 })),
    referrals: referrals.map((r) => ({
      source: r.source,
      landing: r.landing,
      count: r._sum.count ?? 0,
      visitors: r._sum.visitors ?? 0,
    })),
  };
}


/** 明细查询入参(全部可选;时间范围默认当天) */
export interface GeoEventFilter {
  bot?: string;
  source?: string;
  pathLike?: string;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD(含当日)
  page?: number;
  pageSize?: number;
}

/** 爬虫事件明细分页列表 */
export async function listCrawlEvents(f: GeoEventFilter) {
  const where = {
    ...(f.bot ? { bot: f.bot } : {}),
    ...(f.pathLike ? { path: { contains: f.pathLike } } : {}),
    ts: dateRange(f.from, f.to),
  };
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(100, f.pageSize ?? 50);
  const [total, items] = await Promise.all([
    prisma.aICrawlEvent.count({ where }),
    prisma.aICrawlEvent.findMany({
      where,
      orderBy: { ts: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { total, page, pageSize, items };
}

/** 引荐事件明细分页列表 */
export async function listReferralEvents(f: GeoEventFilter) {
  const where = {
    ...(f.source ? { source: f.source } : {}),
    ...(f.pathLike ? { landing: { contains: f.pathLike } } : {}),
    ts: dateRange(f.from, f.to),
  };
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(100, f.pageSize ?? 50);
  const [total, items] = await Promise.all([
    prisma.aIReferralEvent.count({ where }),
    prisma.aIReferralEvent.findMany({
      where,
      orderBy: { ts: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { total, page, pageSize, items };
}

function dateRange(from?: string, to?: string) {
  // ts 为 DATETIME;边界含当日(字符串比较对 YYYY-MM-DD 前缀成立)
  const gte = from ? new Date(`${from}T00:00:00`) : undefined;
  const lt = to ? new Date(`${to}T23:59:59.999`) : undefined;
  if (!gte && !lt) return undefined;
  return { ...(gte ? { gte } : {}), ...(lt ? { lt } : {}) };
}

/** 明细保留清理:删除 before(YYYY-MM-DD) 之前的明细行(运维/定时任务调用) */
export async function purgeEventsBefore(before: string): Promise<{ crawl: number; referral: number }> {
  const lt = new Date(`${before}T00:00:00`);
  const [crawl, referral] = await Promise.all([
    prisma.aICrawlEvent.deleteMany({ where: { ts: { lt } } }),
    prisma.aIReferralEvent.deleteMany({ where: { ts: { lt } } }),
  ]);
  return { crawl: crawl.count, referral: referral.count };
}

/** 保留策略:180 天(与方案确认一致) */
export const EVENT_RETENTION_DAYS = 180;
