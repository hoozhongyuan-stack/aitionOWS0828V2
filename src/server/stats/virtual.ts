import type { StatsConfig } from "@/lib/config";

/**
 * 拟真互动数据算法(V4.8.0)——纯函数,零 IO,可单测、可在任意进程复用。
 *
 * 设计要点(为什么是"算"而不是"存"):
 *   本系统没有定时任务。若靠定时器累加计数,服务停机就会断档,且时间漂移无法回补。
 *   改为确定性伪随机:种子 = 全局盐 + 单篇盐 + 内容 id + 日期拼成,按"当前时刻"直接算出
 *   展示值 —— 停机多久都能补出这段曲线的产物,天然幂等,刷新不变,不会出现
 *   "同一篇文章两次刷新数字不一样"或"数字往回跳"的穿帮。
 *
 * 三个来源相加(全部只增不减):
 *   1) 自然增长 organic —— 发布越久累计越多,幂律长尾 + 星期节律 + 逐日抖动;
 *   2) 真实放大 amplify —— 每次真实阅读 × 随机系数,且分 5 天释放(不是立刻跳变);
 *   3) 真实值兜底 —— 展示值永不小于真实计数(升级前的历史真实阅读不会"消失")。
 *
 * 铁律:本模块只产出"展示值",绝不写 Content 的任何真实计数列。
 */

// ============================================================
// 随机源:确定性(同种子 → 同序列)
// ============================================================

/** FNV-1a 32 位散列:把任意成分折叠成稳定种子 */
export function hash32(...parts: (string | number)[]): number {
  const s = parts.join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32:确定性 PRNG,返回 [0,1) */
export function makeRand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 区间均匀抖动:同种子恒等 */
function jitter(seed: number, lo: number, hi: number): number {
  return lo + (hi - lo) * makeRand(seed)();
}

/** 标准正态抽样(Box-Muller),同种子恒等 */
function normal(seed: number): number {
  const rand = makeRand(seed);
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

// ============================================================
// 时间口径(本地时区,与统计模块 DailyStat 一致)
// ============================================================

/** 本地时区 YYYY-MM-DD */
export function localDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 本地零点毫秒 */
function startOfDayLocal(atMs: number): number {
  const d = new Date(atMs);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** 日历天差(跨月/跨年/夏令时都正确;不用毫秒除法) */
function calendarDayDiff(fromMs: number, toMs: number): number {
  const a = new Date(fromMs);
  const b = new Date(toMs);
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / 86_400_000);
}

/** 第 n 天的本地零点(日历滚动,规避夏令时) */
function dayStartMs(baseMs: number, n: number): number {
  const d = new Date(baseMs);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
}

/** 某一天在 now 时刻已过的比例:过去=1、未来=0、当天=线性(整数化后即"慢慢增长") */
function elapsedFraction(dayStart: number, nowMs: number): number {
  const nextStart = (() => {
    const d = new Date(dayStart);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  })();
  if (nowMs >= nextStart) return 1;
  if (nowMs <= dayStart) return 0;
  return (nowMs - dayStart) / (nextStart - dayStart);
}

// ============================================================
// 曲线参数
// ============================================================

/** 归一化窗口:baseViews 的口径 = "发布后 30 天累计阅读" */
const NORM_DAYS = 30;
/** 扫描上限(约 10 年):再老的尾巴小到可忽略,同时挡住极端脏数据的循环开销 */
const MAX_SCAN_DAYS = 3650;
/** 星期节律(索引 = Date#getDay():0=周日):工作日高、周末低,均值恰为 1(不改变总盘子) */
const WEEKDAY = [0.91, 1.06, 1.08, 1.07, 1.05, 1.0, 0.83];
/** 逐日抖动区间(均值 1):让日线有噪声,不是平滑曲线 */
const DAY_JITTER: [number, number] = [0.72, 1.28];
/** 真实阅读放大的"随机系数"抖动区间(均值约 1.15,略偏放大) */
const AMP_JITTER: [number, number] = [0.55, 1.75];
/** 延迟释放剖面:真实阅读发生在某天时,放大量分 5 天释放(合计 1) */
export const RELEASE_PROFILE = [0.42, 0.24, 0.16, 0.11, 0.07] as const;

export type StatsMode = "AUTO" | "OFF" | "CUSTOM";

/** 一篇内容的拟真输入(全部来自现有列,不新增真实计数) */
export interface ContentStatFacts {
  id: number;
  publishedAt: Date;
  realViews: number;
  realLikes: number;
  realShares: number;
  statsMode: string;
  statsBase: number | null;
  statsSalt: string | null;
  /** 内容状态(可选):非 PUBLISHED 不参与拟真 —— 草稿/下架内容不该"长"出阅读量 */
  status?: string;
}

/** 真实阅读日明细(ContentDailyView) */
export interface DailyRealViews {
  date: string; // YYYY-MM-DD
  views: number;
}

export interface DisplayCounts {
  views: number;
  likes: number;
  shares: number;
}

// ============================================================
// 主计算
// ============================================================

/**
 * 算出某篇内容在 now 时刻的三个展示值。
 * @param facts 内容事实(真实计数 + 拟真参数)
 * @param daily 真实阅读日明细(可为空)
 * @param cfg   站点拟真配置
 * @param now   当前时刻(测试可注入)
 */
export function computeDisplayCounts(
  facts: ContentStatFacts,
  daily: readonly DailyRealViews[],
  cfg: StatsConfig,
  now: Date = new Date()
): DisplayCounts {
  const real: DisplayCounts = {
    views: Math.max(0, facts.realViews),
    likes: Math.max(0, facts.realLikes),
    shares: Math.max(0, facts.realShares),
  };
  // 关闭总开关 / 该篇不拟真 / 未发布 → 原样返回真实值(逐字节等价于升级前)
  if (!cfg.enabled || facts.statsMode === "OFF") return real;
  if (facts.status !== undefined && facts.status !== "PUBLISHED") return real;

  const nowMs = now.getTime();
  const publishedMs = facts.publishedAt.getTime();
  // 未发布(定时/草稿)不产生拟真流量;已发布但至今不足一瞬间也返回真实值
  if (!(publishedMs < nowMs)) return real;

  const publishDay = startOfDayLocal(publishedMs); // 真实阅读日明细按自然日归档,锚在自然日
  const baseSeed = hash32(cfg.seedSalt, facts.statsSalt ?? "", facts.id, "organic");

  // —— 1) 自然增长 ——
  const organic = organicViews({ baseSeed, facts, cfg, nowMs });

  // —— 2) 真实阅读放大 + 延迟释放 ——
  const amplified = amplifiedViews({ baseSeed, facts, cfg, publishDay, daily, nowMs });

  // —— 3) 合成 ——
  // 展示阅读 = 自然增长 + 放大;并保证不低于真实阅读(升级前存量真实阅读不"消失")
  const views = Math.max(Math.round(organic + amplified), real.views);

  // 点赞/转发:由展示阅读按比率派生(篇内比率固定 → 篇间不同),真实互动 1:1 叠加,
  // 保证前台"点一下 +1"的手感不变
  const likeRatio = cfg.likeRate * jitter(hash32(baseSeed, "like"), 0.8, 1.25);
  const shareRatio = cfg.shareRate * jitter(hash32(baseSeed, "share"), 0.8, 1.25);
  let likes = Math.round(views * likeRatio) + real.likes;
  let shares = Math.round(likes * shareRatio) + real.shares;
  likes = Math.min(likes, views); // 点赞不可能多于阅读
  shares = Math.min(shares, likes); // 转发不可能多于点赞

  return { views, likes, shares };
}

/**
 * 自然增长累计量。
 *
 * 时间锚点是"发布时刻"而非自然日零点:人生第一个 24 小时窗口 = [发布, 发布+24h)。
 * 若按自然日切分,上午 9:30 发布的文章到 10:30 会"继承"当天已过去的 9.5 小时,
 * 首小时直接吃掉当天 43% 的量(自检实测篇#1009 一小时 198 阅读,明显不像真的)。
 */
function organicViews(input: {
  baseSeed: number;
  facts: ContentStatFacts;
  cfg: StatsConfig;
  nowMs: number;
}): number {
  const { baseSeed, facts, cfg, nowMs } = input;
  const publishedMs = facts.publishedAt.getTime();
  const elapsedMs = nowMs - publishedMs;
  if (elapsedMs <= 0) return 0;

  // 人气基数:篇间差异(对数正态,均值≈baseViews×scale);CUSTOM 模式用管理员填的基数
  const isCustom = facts.statsMode === "CUSTOM" && (facts.statsBase ?? 0) > 0;
  const popularity = isCustom
    ? clamp(facts.statsBase as number, 1, 1e9)
    : Math.max(1, cfg.baseViews * cfg.scale * Math.exp(clamp(normal(baseSeed), -2.2, 2.2) * cfg.spread));

  const decay = clamp(cfg.decay, 0.3, 2);
  const weightOf = (d: number) => Math.pow(d + 1, -decay);
  const dayWeight = (d: number) =>
    weightOf(d) *
    // 星期节律取该窗口起始时刻的星期几(只是"工作日高、周末低"的节拍,不影响单调性)
    WEEKDAY[new Date(publishedMs + d * 86_400_000).getDay()] *
    jitter(hash32(baseSeed, "d", d), DAY_JITTER[0], DAY_JITTER[1]);

  // 归一化基准:与 baseViews 的口径对齐(前 30 天权重和 = 1)
  let norm = 0;
  for (let d = 0; d < NORM_DAYS; d++) norm += weightOf(d);

  const dayNow = Math.floor(elapsedMs / 86_400_000);
  const frac = (elapsedMs % 86_400_000) / 86_400_000; // 当前 24h 窗口已过比例

  let acc = 0;
  const past = Math.min(dayNow, MAX_SCAN_DAYS);
  for (let d = 0; d < past; d++) acc += dayWeight(d);
  if (dayNow <= MAX_SCAN_DAYS) {
    // 当天按已过时长线性释放:一小时内就有小数字,且一直缓慢增长(整数化后只增不减)
    acc += dayWeight(dayNow) * frac;
  }
  return (popularity * acc) / norm;
}

/** 真实阅读的放大贡献(分 5 天释放) */
function amplifiedViews(input: {
  baseSeed: number;
  facts: ContentStatFacts;
  cfg: StatsConfig;
  publishDay: number;
  daily: readonly DailyRealViews[];
  nowMs: number;
}): number {
  const { baseSeed, cfg, publishDay, daily, nowMs } = input;
  if (!daily.length || cfg.amplify <= 0) return 0;

  let total = 0;
  for (const row of daily) {
    if (!(row.views > 0)) continue;
    const dayMs = Date.parse(`${row.date}T00:00:00`);
    if (Number.isNaN(dayMs)) continue;
    const d = calendarDayDiff(publishDay, dayMs);
    if (d < 0 || d > MAX_SCAN_DAYS) continue;

    // 逐日独立随机系数:同一次真实阅读在不同日期落地的放大倍数不同
    const k =
      cfg.amplify * jitter(hash32(baseSeed, "amp", row.date), AMP_JITTER[0], AMP_JITTER[1]);

    let released = 0;
    for (let i = 0; i < RELEASE_PROFILE.length; i++) {
      const f = elapsedFraction(dayStartMs(publishDay, d + i), nowMs);
      if (f <= 0) break; // 后续天数都在未来
      released += RELEASE_PROFILE[i] * f;
    }
    // max(1, …):系数被调得很小时,真实阅读本身也至少 1:1 计入
    total += row.views * Math.max(1, k * released);
  }
  return total;
}
