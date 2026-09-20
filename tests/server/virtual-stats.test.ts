import { describe, expect, it } from "vitest";
import {
  computeDisplayCounts,
  hash32,
  makeRand,
  localDateString,
  RELEASE_PROFILE,
  type ContentStatFacts,
  type DailyRealViews,
} from "@/server/stats/virtual";

/**
 * 拟真互动数据算法(V4.8.0)——纯函数不变量锁死。
 * 这些断言就是"拟真"的定义:只增不减、刷新不变、篇间不同、比例合理、放大延迟释放。
 */

type Cfg = Parameters<typeof computeDisplayCounts>[2];

const CFG: Cfg = {
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

const PUBLISHED = new Date("2026-09-01T10:00:00");

function facts(over: Partial<ContentStatFacts> = {}): ContentStatFacts {
  return {
    id: 1,
    publishedAt: PUBLISHED,
    realViews: 0,
    realLikes: 0,
    realShares: 0,
    statsMode: "AUTO",
    statsBase: null,
    statsSalt: null,
    ...over,
  };
}

/** 发布后第 n 天中午(整点,避免小数影响直观判断) */
function atDay(n: number, hour = 12): Date {
  const d = new Date(PUBLISHED);
  d.setDate(d.getDate() + n);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function organicOnly(f: ContentStatFacts, now: Date, cfg: Cfg = CFG): number {
  return computeDisplayCounts(f, [], cfg, now).views;
}

describe("随机源:确定性与分布", () => {
  it("hash32 对相同成分恒等,对不同成分不同", () => {
    expect(hash32("v1", 1, "d", 3)).toBe(hash32("v1", 1, "d", 3));
    expect(hash32("v1", 1, "d", 3)).not.toBe(hash32("v1", 1, "d", 4));
  });

  it("mulberry32 同种子同序列,取值落在 [0,1)", () => {
    const a = makeRand(42);
    const b = makeRand(42);
    for (let i = 0; i < 50; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("localDateString 输出本地时区 YYYY-MM-DD", () => {
    expect(localDateString(new Date(2026, 8, 20, 0, 30))).toBe("2026-09-20");
  });
});

describe("开关与模式:关闭时逐字节等于真实值", () => {
  const real = { realViews: 17, realLikes: 3, realShares: 1 };

  it("总开关关闭 → 真实值", () => {
    const got = computeDisplayCounts(facts(real), [], { ...CFG, enabled: false }, atDay(30));
    expect(got).toEqual({ views: 17, likes: 3, shares: 1 });
  });

  it("单篇 OFF → 真实值(即使总开关打开)", () => {
    const got = computeDisplayCounts(facts({ ...real, statsMode: "OFF" }), [], CFG, atDay(30));
    expect(got).toEqual({ views: 17, likes: 3, shares: 1 });
  });

  it("未发布(发布时间在未来)→ 真实值", () => {
    const future = new Date("2027-01-01T00:00:00");
    const got = computeDisplayCounts(facts({ ...real, publishedAt: future }), [], CFG, atDay(0));
    expect(got).toEqual({ views: 17, likes: 3, shares: 1 });
  });

  it("真实值兜底:曲线量小于真实计数时取真实计数", () => {
    const got = computeDisplayCounts(facts({ realViews: 99, realLikes: 5, realShares: 2 }), [], CFG, atDay(0, 11));
    expect(got.views).toBeGreaterThanOrEqual(99);
    expect(got.likes).toBeGreaterThanOrEqual(5);
    expect(got.shares).toBeGreaterThanOrEqual(2);
  });
});

describe("拟真不变量", () => {
  it("确定性:同一时刻重复计算完全一致(刷新不跳数字)", () => {
    const f = facts({ id: 777 });
    const now = atDay(3, 9);
    const a = computeDisplayCounts(f, [], CFG, now);
    const b = computeDisplayCounts(f, [], CFG, now);
    expect(a).toEqual(b);
  });

  it("单调不减:时间推进时三个值都不回退", () => {
    for (const id of [1, 2, 33, 512]) {
      const f = facts({ id });
      let prev = { views: 0, likes: 0, shares: 0 };
      for (let hour = 1; hour <= 24 * 40; hour += 7) {
        const now = new Date(PUBLISHED.getTime() + hour * 3600_000);
        const got = computeDisplayCounts(f, [], CFG, now);
        expect(got.views).toBeGreaterThanOrEqual(prev.views);
        expect(got.likes).toBeGreaterThanOrEqual(prev.likes);
        expect(got.shares).toBeGreaterThanOrEqual(prev.shares);
        prev = got;
      }
    }
  });

  it("新文一小时内已有小数字(不是 0,也不夸张)", () => {
    const got = computeDisplayCounts(facts({ id: 5 }), [], CFG, new Date(PUBLISHED.getTime() + 3600_000));
    expect(got.views).toBeGreaterThan(0);
    expect(got.views).toBeLessThan(40);
  });

  it("30 天累计 ≈ 基数:大样本中位数落在 baseViews 的 ±30%", () => {
    // 人气基数服从对数正态(长尾),样本太小时中位数抖动大 —— 取 201 篇看清"中位"口径
    const samples = Array.from({ length: 201 }, (_, i) => organicOnly(facts({ id: 1000 + i }), atDay(30)));
    const sorted = [...samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    expect(median).toBeGreaterThan(CFG.baseViews * 0.7);
    expect(median).toBeLessThan(CFG.baseViews * 1.3);
  });

  it("篇间量级不同:min < 中位数 < max,且极差 > 2 倍", () => {
    const samples = Array.from({ length: 60 }, (_, i) => organicOnly(facts({ id: 2000 + i }), atDay(30)));
    const sorted = [...samples].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const median = sorted[Math.floor(sorted.length / 2)];
    expect(min).toBeLessThan(median);
    expect(median).toBeLessThan(max);
    expect(max / Math.max(1, min)).toBeGreaterThan(2);
  });

  it("比例约束:整数非负、点赞≤阅读、转发≤点赞", () => {
    for (const id of [3, 9, 77, 999]) {
      const got = computeDisplayCounts(
        facts({ id, realViews: 5, realLikes: 1, realShares: 0 }),
        [],
        CFG,
        atDay(7)
      );
      expect(Number.isInteger(got.views)).toBe(true);
      expect(Number.isInteger(got.likes)).toBe(true);
      expect(Number.isInteger(got.shares)).toBe(true);
      expect(got.views).toBeGreaterThanOrEqual(0);
      expect(got.likes).toBeLessThanOrEqual(got.views);
      expect(got.shares).toBeLessThanOrEqual(got.likes);
    }
  });

  it("点赞量级合理:约为阅读的 1%~5%(默认参数下)", () => {
    for (const id of [11, 22, 333]) {
      const got = computeDisplayCounts(facts({ id }), [], CFG, atDay(30));
      const rate = got.likes / got.views;
      expect(rate).toBeGreaterThan(0.005);
      expect(rate).toBeLessThan(0.06);
    }
  });

  it("换全局种子盐 → 曲线重排(值变化)", () => {
    const f = facts({ id: 42 });
    const a = computeDisplayCounts(f, [], CFG, atDay(30)).views;
    const b = computeDisplayCounts(f, [], { ...CFG, seedSalt: "v2" }, atDay(30)).views;
    expect(a).not.toBe(b);
  });

  it("单篇盐同样生效(后台「重新随机」)", () => {
    const now = atDay(30);
    const a = computeDisplayCounts(facts({ id: 42 }), [], CFG, now).views;
    const b = computeDisplayCounts(facts({ id: 42, statsSalt: "abc123" }), [], CFG, now).views;
    expect(a).not.toBe(b);
  });

  it("CUSTOM 基数被采纳(30 天 ≈ 填写的基数)", () => {
    const got = organicOnly(facts({ id: 8, statsMode: "CUSTOM", statsBase: 2000 }), atDay(30));
    expect(got).toBeGreaterThan(2000 * 0.75);
    expect(got).toBeLessThan(2000 * 1.25);
  });

  it("强度倍数与基数同向生效", () => {
    const base = organicOnly(facts({ id: 12 }), atDay(30));
    const doubled = organicOnly(facts({ id: 12 }), atDay(30), { ...CFG, scale: 2 });
    expect(doubled).toBeGreaterThan(base * 1.8);
  });
});

describe("真实阅读放大:随机系数 + 延迟释放", () => {
  /** 有/无真实阅读的差值 = 放大部分 */
  function amplified(f: ContentStatFacts, daily: DailyRealViews[], now: Date): number {
    return computeDisplayCounts(f, daily, CFG, now).views - organicOnly(f, now);
  }

  const oneViewToday: DailyRealViews[] = [
    { date: localDateString(PUBLISHED), views: 1 },
  ];

  it("当天只释放一部分(不是立刻跳满系数)", () => {
    const now = atDay(0, 23);
    const gain = amplified(facts({ id: 21 }), oneViewToday, now);
    expect(gain).toBeGreaterThan(0);
    // 上界:放大系数上限 × 当天释放比例(42%)
    expect(gain).toBeLessThan(CFG.amplify * 1.75 * 0.42 + 0.5);
  });

  it("5 天内陆续涨出来(第 3 天 > 第 1 天 > 当天)", () => {
    const f = facts({ id: 21 });
    const d0 = amplified(f, oneViewToday, atDay(0, 23));
    const d1 = amplified(f, oneViewToday, atDay(1, 23));
    const d3 = amplified(f, oneViewToday, atDay(3, 23));
    const d5 = amplified(f, oneViewToday, atDay(5, 23));
    expect(d1).toBeGreaterThan(d0);
    expect(d3).toBeGreaterThan(d1);
    expect(d5).toBeGreaterThanOrEqual(d3);
    // 完全释放后落在放大系数的抖动区间内(0.55~1.75 倍)
    expect(d5).toBeGreaterThanOrEqual(CFG.amplify * 0.55 - 0.5);
    expect(d5).toBeLessThanOrEqual(CFG.amplify * 1.75 + 0.5);
  });

  it("延迟释放:逐日释放比例之和恰为 1", () => {
    expect(RELEASE_PROFILE.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it("真实阅读越多放大量越大(单调)", () => {
    const f = facts({ id: 31 });
    const small = amplified(f, [{ date: localDateString(PUBLISHED), views: 1 }], atDay(5));
    const big = amplified(f, [{ date: localDateString(PUBLISHED), views: 10 }], atDay(5));
    expect(big).toBeGreaterThan(small * 8);
  });

  it("放大系数逐日独立随机:同一天量、不同日期 → 不同倍数", () => {
    const f = facts({ id: 44 });
    const now = atDay(20);
    const dayA: DailyRealViews[] = [{ date: "2026-09-02", views: 5 }];
    const dayB: DailyRealViews[] = [{ date: "2026-09-03", views: 5 }];
    const a = amplified(f, dayA, now);
    const b = amplified(f, dayB, now);
    expect(Math.abs(a - b)).toBeGreaterThan(0.5);
  });

  it("放大系数可调:amplify=1 时真实阅读至少 1:1 计入", () => {
    const cfg: Cfg = { ...CFG, amplify: 1 };
    const f = facts({ id: 55 });
    const gain =
      computeDisplayCounts(f, [{ date: localDateString(PUBLISHED), views: 3 }], cfg, atDay(3)).views -
      organicOnly(f, atDay(3), cfg);
    expect(gain).toBeGreaterThanOrEqual(3);
  });

  it("脏日期不参与计算(不抛错)", () => {
    const f = facts({ id: 66 });
    const got = computeDisplayCounts(
      f,
      [{ date: "not-a-date", views: 5 }, { date: "2026-09-02", views: -3 }],
      CFG,
      atDay(3)
    );
    expect(Number.isInteger(got.views)).toBe(true);
    expect(got.views).toBeGreaterThan(0);
  });
});

describe("未发布内容不拟真(V4.8.0 闸门)", () => {
  it("草稿/下架:状态非 PUBLISHED 时只回真实值", () => {
    for (const status of ["DRAFT", "OFFLINE", "SCHEDULED", "PENDING"]) {
      const got = computeDisplayCounts(
        facts({ id: 9, status, realViews: 0, realLikes: 0, realShares: 0 }),
        [],
        CFG,
        atDay(30)
      );
      expect(got).toEqual({ views: 0, likes: 0, shares: 0 });
    }
  });

  it("已发布:照常拟真(闸门只挡未发布)", () => {
    const got = computeDisplayCounts(facts({ id: 9, status: "PUBLISHED" }), [], CFG, atDay(30));
    expect(got.views).toBeGreaterThan(100);
  });

  it("未传状态(前台列表/详情内部调用)时不误伤", () => {
    const got = computeDisplayCounts(facts({ id: 9 }), [], CFG, atDay(30));
    expect(got.views).toBeGreaterThan(100);
  });
});
