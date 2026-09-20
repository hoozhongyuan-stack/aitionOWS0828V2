/**
 * 拟真互动数据 · 曲线自检(V4.8.0)
 *
 * 不连库、不改数据:直接用算法模块 + 默认参数把曲线打出来,供人工判断"像不像真的"。
 * 用法:npx tsx scripts/preview-virtual-stats.ts
 */
import {
  computeDisplayCounts,
  localDateString,
  type ContentStatFacts,
  type DailyRealViews,
} from "../src/server/stats/virtual";

const CFG = {
  enabled: true,
  scale: 1,
  baseViews: 300,
  spread: 0.8,
  decay: 0.95,
  amplify: 12,
  likeRate: 0.022,
  shareRate: 0.22,
  seedSalt: "v1",
};

const PUB = new Date("2026-09-01T09:30:00"); // 发布时刻

function facts(id: number, over: Partial<ContentStatFacts> = {}): ContentStatFacts {
  return {
    id,
    publishedAt: PUB,
    realViews: 0,
    realLikes: 0,
    realShares: 0,
    statsMode: "AUTO",
    statsBase: null,
    statsSalt: null,
    ...over,
  };
}

const at = (hours: number) => new Date(PUB.getTime() + hours * 3600_000);
const fmt = (n: number) => String(n).padStart(7);

console.log("=".repeat(78));
console.log("拟真互动数据 · 曲线自检(默认参数 baseViews=300 amplify=12)");
console.log("=".repeat(78));

// —— ① 发布后 30 天逐日累计(取 3 篇不同人气的文章)——
console.log("\n【① 自然增长:累计展示值(小时/天 → 阅读 / 点赞 / 转发)】\n");
const ids = [1001, 1009, 1024];
console.log("时刻".padEnd(14) + ids.map((i) => `篇#${i}(阅/赞/转)`.padStart(24)).join(""));
for (const hours of [1, 6, 24, 48, 72, 24 * 7, 24 * 14, 24 * 30, 24 * 60, 24 * 180]) {
  const row = ids.map((id) => {
    const r = computeDisplayCounts(facts(id), [], CFG, at(hours));
    return `${fmt(r.views)}/${r.likes}/${r.shares}`.padStart(24);
  });
  const label = hours < 24 ? `${hours} 小时` : `${hours / 24} 天`;
  console.log(label.padEnd(14) + row.join(""));
}

// —— ② 点赞/转发比例 ——
console.log("\n【② 比例(30 天):点赞率 / 转发率 —— 拟真度关键,比例不能离谱】\n");
for (const id of [1001, 1003, 1009, 1017, 1024, 1033]) {
  const r = computeDisplayCounts(facts(id), [], CFG, at(24 * 30));
  const likeRate = ((r.likes / r.views) * 100).toFixed(1);
  const shareRate = ((r.shares / r.likes) * 100).toFixed(0);
  console.log(`篇#${id}: 阅读 ${fmt(r.views)} | 点赞 ${String(r.likes).padStart(4)}(${likeRate}%) | 转发 ${String(r.shares).padStart(3)}(${shareRate}% of 赞)`);
}

// —— ③ 单次真实阅读的"慢慢涨"时间线 ——
console.log("\n【③ 真实阅读放大:3 次真实阅读,分 5 天慢慢释放(不是立刻跳变)】\n");
const dailyDay0: DailyRealViews[] = [{ date: localDateString(PUB), views: 3 }];
let prev = 0;
for (const h of [1, 6, 12, 24, 36, 48, 72, 96, 120, 144, 168]) {
  const withReal = computeDisplayCounts(facts(2001), dailyDay0, CFG, at(h));
  const withoutReal = computeDisplayCounts(facts(2001), [], CFG, at(h));
  const gain = withReal.views - withoutReal.views;
  const delta = gain - prev;
  const label = h < 24 ? `${h} 小时` : `${h / 24} 天`;
  console.log(
    `${label.padEnd(8)} 这 3 次真实阅读已累计长大到 ${String(gain).padStart(3)} 阅读(较上一次 +${String(Math.max(0, delta)).padStart(2)})`
  );
  prev = gain;
}

// —— ④ 篇间分布 ——
console.log("\n【④ 篇间差异:200 篇的 7 天 / 30 天累计阅读分布】\n");
for (const days of [7, 30]) {
  const vals = Array.from({ length: 200 }, (_, i) =>
    computeDisplayCounts(facts(3000 + i), [], CFG, at(24 * days)).views
  ).sort((a, b) => a - b);
  const q = (p: number) => vals[Math.floor((vals.length - 1) * p)];
  console.log(
    `${String(days).padStart(2)} 天:最小 ${String(vals[0]).padStart(4)} | P25 ${String(q(0.25)).padStart(4)} | 中位 ${String(q(0.5)).padStart(4)} | P75 ${String(q(0.75)).padStart(4)} | 最大 ${String(vals[vals.length - 1]).padStart(5)} | 均值 ${(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(0)}`
  );
}

// —— ⑤ 单调性抽查(任意两次刷新,数字只增不减)——
console.log("\n【⑤ 单调性抽查:同一篇连续 20 天,每次刷新都不回退】\n");
let ok = true;
let last = { views: 0, likes: 0, shares: 0 };
for (let h = 0; h <= 24 * 20; h += 3) {
  const r = computeDisplayCounts(facts(4001), [], CFG, at(h));
  if (r.views < last.views || r.likes < last.likes || r.shares < last.shares) {
    ok = false;
    console.log(`✗ 第 ${h} 小时出现回退:${JSON.stringify(last)} → ${JSON.stringify(r)}`);
  }
  last = r;
}
console.log(ok ? "✓ 160 个采样点全部单调不减" : "✗ 存在回退");

// —— ⑥ 真实阅读的放大系数随机性 ——
console.log("\n【⑥ 放大系数的随机性:同样 1 次真实阅读,落在不同日期 → 倍数不同】\n");
const perDay: string[] = [];
for (let d = 0; d < 8; d++) {
  const dayStr = localDateString(new Date(PUB.getFullYear(), PUB.getMonth(), PUB.getDate() + d));
  const gain =
    computeDisplayCounts(facts(5001), [{ date: dayStr, views: 1 }], CFG, at(24 * 40)).views -
    computeDisplayCounts(facts(5001), [], CFG, at(24 * 40)).views;
  perDay.push(`${dayStr.slice(5)} → ×${gain.toFixed(1)}`);
}
console.log(perDay.join("  |  "));
console.log("\n" + "=".repeat(78));
