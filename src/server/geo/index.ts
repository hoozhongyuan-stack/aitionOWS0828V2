import { prisma } from "@/lib/db";
import { AI_CRAWLERS } from "@/lib/seo/ai-crawlers";

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
export type GeoKind = "ai" | "search" | "suspected" | "unknown";

/**
 * 已知 AI 爬虫 UA 关键字 → 引擎显示名(小写包含匹配)。
 * V4.8.2:与 robots.txt 的分组**同源**(@/lib/seo/ai-crawlers),不再各自维护;
 * 数组顺序即匹配优先级(子串关系需长词在前),故这里原样保序映射。
 */
export const AI_BOTS: ReadonlyArray<{ match: string; name: string }> = AI_CRAWLERS.map((c) => ({
  match: c.token.toLowerCase(),
  name: c.name,
}));

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

/**
 * AI 引荐渠道:referer 主机名 → 渠道显示名。
 *
 * 匹配规则(V4.6.7 改「主域名兜底」):host === 域名,或 host 以 ".域名" 结尾。
 *   - 收益:主域写一次即覆盖 www./chat./m. 等所有子域。实测 deepseek.com 与
 *     chat.deepseek.com 解析到同一 IP,此前只写 chat.deepseek.com 会漏掉根域引荐。
 *   - 防误判:"deepseek.com.evil.com" 不以 ".deepseek.com" 结尾 → 不命中;
 *     旧的子串匹配会把它误判成 DeepSeek,这是本次改法的关键差异。
 *   - 铁律:凡与搜索引擎/通用站点共享主域的条目必须写全子域 —— 文心写
 *     wenxin.baidu.com / yiyan.baidu.com,绝不能写 baidu.com,否则「百度搜索」会被
 *     误记成 AI 引荐(引荐判定 AI 先于传统搜索,顺序见 app/[locale]/layout.tsx)。
 *   - 域名均经 DoH 核实(2026-09-13 复核)。
 */
export const AI_REFERRERS: ReadonlyArray<{ name: string; domains: readonly string[] }> = [
  { name: "ChatGPT", domains: ["chatgpt.com", "chat.openai.com"] },
  { name: "Perplexity", domains: ["perplexity.ai"] },
  { name: "豆包", domains: ["doubao.com"] },
  { name: "腾讯元宝", domains: ["yuanbao.tencent.com"] },
  { name: "Grok", domains: ["grok.com", "x.ai"] },
  { name: "Copilot", domains: ["copilot.microsoft.com"] },
  { name: "Gemini", domains: ["gemini.google.com"] },
  // 国内 AI 助手/搜索(V4.6.4 建表,用户勾选 A 组 1-14 + Trae/WorkBuddy;V4.6.7 扩主域)
  { name: "Kimi", domains: ["kimi.com", "moonshot.cn"] },
  { name: "通义千问", domains: ["tongyi.com", "qianwen.com", "qwen.ai", "tongyi.aliyun.com"] },
  { name: "智谱清言", domains: ["chatglm.cn", "chatglm.com", "zhipuai.cn", "z.ai"] },
  { name: "文心一言", domains: ["wenxin.baidu.com", "yiyan.baidu.com"] },
  { name: "DeepSeek", domains: ["deepseek.com"] },
  { name: "秘塔 AI 搜索", domains: ["metaso.cn"] },
  { name: "天工", domains: ["tiangong.cn"] },
  { name: "讯飞星火", domains: ["xinghuo.xfyun.cn", "xfyun.cn"] },
  { name: "纳米 AI 搜索(360)", domains: ["n.cn"] },
  { name: "夸克", domains: ["quark.cn"] },
  { name: "海螺 AI", domains: ["hailuoai.com"] },
  { name: "跃问", domains: ["yuewen.cn"] },
  { name: "Trae", domains: ["trae.cn"] },
  { name: "WorkBuddy", domains: ["workbuddy.ai"] },
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

/** 取 referer 主机名;非标准 URL(如 android-app://xxx 或裸字符串)返回 null */
function refererHost(referer: string): string | null {
  try {
    return new URL(referer).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

/** 主域兜底匹配:host 等于域名,或以 ".域名" 结尾(带点前缀,避免后缀仿冒域误判) */
function hostMatchesDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** referer → 渠道名;非 AI 渠道返回 null */
export function matchReferral(referer: string | null | undefined): string | null {
  if (!referer) return null;
  const host = refererHost(referer);
  const lower = referer.toLowerCase();
  for (const r of AI_REFERRERS) {
    // 标准 URL 走主机名精确/子域匹配;非标准 referer(客户端自定义 scheme)退回子串兜底
    const hit = host
      ? r.domains.some((d) => hostMatchesDomain(host, d))
      : r.domains.some((d) => lower.includes(d));
    if (hit) return r.name;
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

/**
 * GEO 记录白名单(V4.8.2 修复):是否应把这次请求记入 GEO。
 *
 * 此前用子串正则 `/\/admin|\/_next|\/uploads|\/api/` 判断,**不是按路径段匹配**:
 * `/zh-CN/article/api-design`、`/zh-CN/c/api-case`、`/zh-CN/article/admin-guide`、
 * `/zh-CN/c/uploads-guide` 这类正常内容页会被误判为后台/接口路径 → AI 抓取与引荐静默不记录。
 *
 * 现在只看 locale 之后**第一段**是不是路由级排除段;内容 slug 无论叫什么都能记录
 * (注意:正则加锚点也解决不了"栏目 slug 恰好叫 api"的情况,按段判断才可以)。
 */
const GEO_EXCLUDED_SECTIONS = new Set(["admin", "api", "_next", "uploads"]);

export function isGeoRecordablePath(reqPath: string, locale: string): boolean {
  const segments = reqPath.split("/").filter(Boolean);
  const section = segments[0] === locale ? segments[1] ?? "" : segments[0] ?? "";
  return !GEO_EXCLUDED_SECTIONS.has(section);
}

/**
 * 记录一次引荐(渠道+落地页+日期 upsert 累加);kind: ai | search。
 *
 * 独立访客口径(V4.8.2,含历史修复):
 * - 由调用方传入前台匿名访客标识(`visitorId`,客户端 localStorage 里的 aition_vid);
 *   服务端看不到它,所以引荐识别在 `/api/track`(客户端上报)发起。
 * - 判定"新访客"靠 **AIReferralVisitor 的唯一约束**(source+date+visitorId):
 *   插入成功 = 该访客当天首次从该渠道到达 → visitors +1;唯一冲突 = 老访客 → 只累加 count。
 *   这取代了此前"先 aggregate 再写"的写法 —— 那种写法有并发竞态(同一天两个首访可能双计/漏计),
 *   且 visitors 只会落在当天第一个落地页上,后台读起来像"每个落地页的访客数"。
 * - 未传 visitorId 时只累加 count(兼容旧调用/非浏览器路径),visitors 不动。
 */
export async function recordReferral(
  source: string,
  landing: string,
  kind: GeoKind = "ai",
  visitorId?: string | null
): Promise<void> {
  const p = landing.slice(0, 200) || "/";
  const date = today();

  let newVisitor = false;
  if (visitorId) {
    try {
      await prisma.aIReferralVisitor.create({
        data: { source, date, visitorId: visitorId.slice(0, 64), landing: p },
      });
      newVisitor = true;
    } catch {
      newVisitor = false; // 唯一约束冲突 = 今天这个访客已经从该渠道来过
    }
  }

  try {
    await prisma.$transaction([
      prisma.aIReferralStat.upsert({
        where: { source_landing_date: { source, landing: p, date } },
        update: {
          count: { increment: 1 },
          ...(newVisitor ? { visitors: { increment: 1 } } : {}),
        },
        create: { source, landing: p, date, count: 1, visitors: newVisitor ? 1 : 0, kind },
      }),
      prisma.aIReferralEvent.create({ data: { source, landing: p, kind } }),
    ]);
  } catch (e) {
    console.error("[geo] 引荐记录失败:", e);
  }
}

/** 未识别来源日采样上限(V4.7.2):明细事件上限,聚合计数不受限 */
export const UNKNOWN_REFERRAL_DAILY_LIMIT = 200;
const gu = globalThis as unknown as { __unknownRefSample?: { date: string; n: number } };
function bumpUnknownSampling(): boolean {
  const d = today();
  const cur = gu.__unknownRefSample ?? (gu.__unknownRefSample = { date: d, n: 0 });
  if (cur.date !== d) {
    cur.date = d;
    cur.n = 0;
  }
  cur.n += 1;
  return cur.n <= UNKNOWN_REFERRAL_DAILY_LIMIT;
}

/** 从 Referer 提取主机名(小写,去端口);无法解析返回 null */
export function refererHostname(referer: string | null | undefined): string | null {
  if (!referer) return null;
  try {
    const h = new URL(referer).hostname.toLowerCase();
    return h || null;
  } catch {
    return null;
  }
}

/**
 * 未识别来源(V4.7.2):Referer 存在、不属于本站、也没命中任何白名单时,**只记录主机名**。
 *
 * 用途:判断"为什么某家 AI 没有引荐记录" —— 若这里出现 `chat.deepseek.com`,说明它带了
 * Referer 只是格式与白名单不符;若连这里都没有,则确证它**未发送 Referer**(客户端/`noreferrer`),
 * 那是对方行为,服务端无法补记。
 *
 * 隐私:只存主机名,不存完整 URL、路径与查询串;明细事件有日采样上限。
 */
export async function recordUnknownReferral(host: string, landing: string): Promise<void> {
  const source = host.slice(0, 120);
  const p = landing.slice(0, 200) || "/";
  const storeEvent = bumpUnknownSampling();
  try {
    await prisma.$transaction([
      prisma.aIReferralStat.upsert({
        where: { source_landing_date: { source, landing: p, date: today() } },
        update: { count: { increment: 1 } },
        create: { source, landing: p, date: today(), count: 1, visitors: 0, kind: "unknown" },
      }),
      ...(storeEvent
        ? [prisma.aIReferralEvent.create({ data: { source, landing: p, kind: "unknown" } })]
        : []),
    ]);
  } catch (e) {
    console.error("[geo] 未识别来源记录失败:", e);
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
      // 引荐只有 ai / search / unknown 三种口径(suspected 无引荐,回落 ai)
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
export async function purgeEventsBefore(
  before: string
): Promise<{ crawl: number; referral: number; visitors: number }> {
  const lt = new Date(`${before}T00:00:00`);
  // 独立访客表按 date(YYYY-MM-DD 字符串)归档,字典序即时间序,可直接字符串比较
  const day = before.slice(0, 10);
  const [crawl, referral, visitors] = await Promise.all([
    prisma.aICrawlEvent.deleteMany({ where: { ts: { lt } } }),
    prisma.aIReferralEvent.deleteMany({ where: { ts: { lt } } }),
    // V4.8.2:访客去重表属明细层,同样按保留策略清理(否则只增不减)
    prisma.aIReferralVisitor.deleteMany({ where: { date: { lt: day } } }),
  ]);
  return { crawl: crawl.count, referral: referral.count, visitors: visitors.count };
}

/** 保留策略:180 天(与方案确认一致) */
export const EVENT_RETENTION_DAYS = 180;
