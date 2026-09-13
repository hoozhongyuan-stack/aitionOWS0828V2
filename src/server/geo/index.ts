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
 *
 * V4.6.4 口径分区(kind):'ai'(AI 引擎) / 'search'(传统搜索引擎) / 'suspected'(疑似 AI 抓取,推测)
 *   - AI 与 传统搜索 **分开计数**,GEO 可见性指标不被传统搜索污染
 *   - 'suspected' 为启发式(通用 UA 抓取),独立只读区块展示,不进正式指标
 */

/** 统计口径(V4.6.4):ai=AI 引擎 | search=传统搜索引擎 | suspected=疑似 AI 抓取(推测) */
export type GeoKind = "ai" | "search" | "suspected";

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
  // 国内引擎增补(V3.3 C3,UA 已核实自 ai-robots-txt 清单):
  // 腾讯混元/元宝与百度无公开声明的 AI 爬虫 UA(EdgeOne 官方清单亦未收录),故不入表;
  // Baiduspider 属传统搜索爬虫,计入会污染 GEO 口径。
  { match: "kimibot", name: "KimiBot (月之暗面 Kimi)" },
  { match: "kimi-searchbot", name: "Kimi-SearchBot (Kimi 检索)" },
  { match: "kimi-user", name: "Kimi-User (Kimi 用户触发)" },
  { match: "chatglm-spider", name: "ChatGLM-Spider (智谱清言)" },
  { match: "tongyibot", name: "TongyiBot (阿里通义)" },
  { match: "pangubot", name: "PanguBot (华为盘古)" },
];

/** 传统搜索引擎爬虫 UA 关键字 → 显示名(V4.6.4;与 AI 口径隔离统计) */
export const SEARCH_BOTS: ReadonlyArray<{ match: string; name: string }> = [
  { match: "baiduspider", name: "Baiduspider (百度)" },
  { match: "sogou web spider", name: "Sogou web spider (搜狗)" },
  { match: "sogou inst spider", name: "Sogou inst spider (搜狗)" },
  { match: "360spider", name: "360Spider (360 搜索)" },
  { match: "haosouspider", name: "HaosouSpider (360 好搜)" },
  { match: "shenmaspider", name: "ShenmaSpider (神马/移动)" },
  { match: "yisouspider", name: "YisouSpider (一搜)" },
  { match: "bingbot", name: "Bingbot (微软 Bing)" },
];

/** 传统搜索引擎引荐:referer host 关键字 → 显示名(V4.6.4) */
export const SEARCH_REFERRERS: ReadonlyArray<{ match: string; name: string }> = [
  { match: "baidu.com", name: "百度搜索" },
  { match: "so.com", name: "360 搜索" },
  { match: "sogou.com", name: "搜狗搜索" },
  { match: "sm.cn", name: "神马搜索" },
  { match: "bing.com", name: "Bing" },
  { match: "google.", name: "Google 搜索" },
];

/**
 * 疑似 AI 抓取启发式(V4.6.4):通用 HTTP 客户端 UA —— 这类抓取多来自
 * AI 开发/办公工具(WorkBuddy/Trae/ZCode 等按需抓取)或脚本,无产品标识。
 * 仅作"推测"分区展示;中间件不经过静态资源,"同 IP 不取静态资源"信号无法观测(已知限制)。
 */
const GENERIC_CLIENT_PATTERNS = [
  "node",
  "undici",
  "python-requests",
  "python-urllib",
  "httpx",
  "aiohttp",
  "curl",
  "wget",
  "go-http-client",
  "okhttp",
  "java/",
  "axios",
  "guzzle",
  "scrapy",
  "libwww-perl",
  "postmanruntime",
];

/** UA 是否为通用 HTTP 客户端(疑似爬取脚本/AI 工具按需抓取) */
export function isGenericClient(ua: string | null | undefined): boolean {
  if (!ua) return false;
  const lower = ua.toLowerCase();
  return GENERIC_CLIENT_PATTERNS.some((p) => lower.includes(p));
}

/** UA → 传统搜索引擎名;非搜索爬虫返回 null */
export function matchSearchBot(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const lower = ua.toLowerCase();
  for (const b of SEARCH_BOTS) {
    if (lower.includes(b.match)) return b.name;
  }
  return null;
}

/** referer → 传统搜索引擎名 */
export function matchSearchReferral(referer: string | null | undefined): string | null {
  if (!referer) return null;
  const lower = referer.toLowerCase();
  for (const r of SEARCH_REFERRERS) {
    if (lower.includes(r.match)) return r.name;
  }
  return null;
}

/** AI 引荐渠道:referer host 关键字 → 渠道显示名 */
export const AI_REFERRERS: ReadonlyArray<{ match: string; name: string }> = [
  { match: "chatgpt.com", name: "ChatGPT" },
  { match: "perplexity.ai", name: "Perplexity" },
  { match: "doubao.com", name: "豆包" },
  { match: "yuanbao.tencent.com", name: "腾讯元宝" },
  { match: "grok.com", name: "Grok" },
  { match: "copilot.microsoft.com", name: "Copilot" },
  { match: "gemini.google.com", name: "Gemini" },
  // 国内 AI 助手/搜索(V4.6.4 扩,域名均 DoH 核实;用户勾选 A 组 1-14 + Trae/WorkBuddy)
  { match: "kimi.com", name: "Kimi" },
  { match: "kimi.moonshot.cn", name: "Kimi" },
  { match: "tongyi.com", name: "通义千问" },
  { match: "qianwen.com", name: "通义千问" },
  { match: "chatglm.cn", name: "智谱清言" },
  { match: "chatglm.com", name: "智谱清言" },
  { match: "zhipuai.cn", name: "智谱清言" },
  { match: "wenxin.baidu.com", name: "文心一言" },
  { match: "yiyan.baidu.com", name: "文心一言" },
  { match: "chat.deepseek.com", name: "DeepSeek" },
  { match: "metaso.cn", name: "秘塔 AI 搜索" },
  { match: "tiangong.cn", name: "天工" },
  { match: "xinghuo.xfyun.cn", name: "讯飞星火" },
  { match: "n.cn", name: "纳米 AI 搜索(360)" },
  { match: "quark.cn", name: "夸克" },
  { match: "hailuoai.com", name: "海螺 AI" },
  { match: "yuewen.cn", name: "跃问" },
  { match: "trae.cn", name: "Trae" },
  { match: "workbuddy.ai", name: "WorkBuddy" },
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

/** 记录一次爬虫抓取(按 引擎+日期+路径 upsert 累加);kind: ai | search | suspected */
export async function recordCrawl(
  bot: string,
  path: string,
  ua?: string,
  kind: GeoKind = "ai"
): Promise<void> {
  const p = path.slice(0, 200) || "/";
  // 疑似抓取:日采样上限(超出只累加聚合计数,不再存明细,防噪声爆库)
  const storeEvent = kind !== "suspected" || bumpSuspectedSampling();
  try {
    await prisma.$transaction([
      prisma.aICrawlStat.upsert({
        where: { bot_date_path: { bot, date: today(), path: p } },
        update: { count: { increment: 1 } },
        create: { bot, date: today(), path: p, count: 1, kind },
      }),
      ...(storeEvent
        ? [prisma.aICrawlEvent.create({ data: { bot, path: p, ua: ua?.slice(0, 300), kind } })]
        : []),
    ]);
  } catch (e) {
    console.error("[geo] 爬虫记录失败:", e);
  }
}

/** 疑似抓取日采样上限(V4.6.4):进程内计数,跨日自动重置 */
export const SUSPECTED_DAILY_SAMPLE_LIMIT = 200;
const g = globalThis as unknown as { __suspectSample?: { date: string; n: number } };
function bumpSuspectedSampling(): boolean {
  const d = today();
  const cur = g.__suspectSample ?? (g.__suspectSample = { date: d, n: 0 });
  if (cur.date !== d) {
    cur.date = d;
    cur.n = 0;
  }
  cur.n += 1;
  return cur.n <= SUSPECTED_DAILY_SAMPLE_LIMIT;
}

/** 记录一次引荐(渠道+落地页+日期 upsert 累加);kind: ai | search */
export async function recordReferral(
  source: string,
  landing: string,
  isNewVisitor: boolean,
  kind: GeoKind = "ai"
): Promise<void> {
  const p = landing.slice(0, 200) || "/";
  try {
    await prisma.$transaction([
      prisma.aIReferralStat.upsert({
        where: { source_landing_date: { source, landing: p, date: today() } },
        update: {
          count: { increment: 1 },
          ...(isNewVisitor ? { visitors: { increment: 1 } } : {}),
        },
        create: { source, landing: p, date: today(), count: 1, visitors: 1, kind },
      }),
      prisma.aIReferralEvent.create({ data: { source, landing: p, kind } }),
    ]);
  } catch (e) {
    console.error("[geo] 引荐记录失败:", e);
  }
}

/** 后台 GEO 监测聚合:趋势/Top 页面/引荐表(from/to 为 YYYY-MM-DD,默认近 7 天) */
export async function getGeoMonitorStats(from: string, to: string, kind: GeoKind = "ai") {
  const [crawlTrend, topPages, referrals] = await Promise.all([
    prisma.aICrawlStat.groupBy({
      by: ["date", "bot"],
      where: { date: { gte: from, lte: to }, kind },
      _sum: { count: true },
      orderBy: { date: "asc" },
    }),
    prisma.aICrawlStat.groupBy({
      by: ["path", "bot"],
      where: { date: { gte: from, lte: to }, kind },
      _sum: { count: true },
      orderBy: { _sum: { count: "desc" } },
      take: 10,
    }),
    prisma.aIReferralStat.groupBy({
      by: ["source", "landing"],
      where: { date: { gte: from, lte: to }, kind: kind === "suspected" ? "ai" : kind },
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
export async function listCrawlEvents(f: GeoEventFilter, kind: GeoKind = "ai") {
  const where = {
    kind,
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
export async function listReferralEvents(f: GeoEventFilter, kind: GeoKind = "ai") {
  const where = {
    kind: kind === "suspected" ? "ai" : kind,
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
