import { beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

/**
 * 拟真互动数据 —— 服务层接入(V4.8.0)。
 * 锁住:前台出口拿到展示值、OFF/关闭时逐字节回落真实值、真实阅读按天记账且放大量延迟到账、
 * 点赞接口回包是展示值(否则前台点一下数字会从拟真值掉回真实值)。
 *
 * 配置用可变对象注入(mock 保留其余真实实现),避免污染共享测试库里的 Setting 表。
 */

const CFG = {
  enabled: true,
  scale: 1,
  baseViews: 400,
  spread: 0.8,
  decay: 0.95,
  amplify: 10,
  likeRate: 0.05,
  shareRate: 0.2,
  favoriteRate: 0.02,
  seedSalt: "test-salt",
};

vi.mock("@/lib/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config")>();
  return { ...actual, getStatsConfig: async () => CFG };
});

vi.mock("@/lib/ugc/anti-spam", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ugc/anti-spam")>();
  return {
    ...actual,
    // next/headers 的 cookies() 在 node 环境不可用 —— 固定一个游客指纹
    getOrCreateGuestKey: async () => ({ key: "v480-test-guest", isNew: false }),
  };
});

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...actual,
    getUserSession: async () => null,
    getActiveUserSession: async () => null,
  };
});

type StatsModule = typeof import("@/server/stats");
type UgcModule = typeof import("@/server/ugc");

let db: PrismaClient;
let stats: StatsModule;
let ugc: UgcModule;
let categoryId = 0;

/** 相对"现在"的回溯天数,便于构造不同树龄的内容 */
function daysAgo(n: number, hour = 10): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d;
}

async function makeContent(slug: string, over: Record<string, unknown> = {}) {
  return db.content.create({
    data: {
      slug,
      categoryId,
      status: "PUBLISHED",
      authorName: "拟真测试",
      publishAt: daysAgo(10),
      translations: { create: { locale: "zh-CN", title: slug, body: "<p>x</p>" } },
      ...over,
    },
  });
}

beforeAll(async () => {
  stats = await import("@/server/stats");
  ugc = await import("@/server/ugc");
  db = (await import("@/lib/db")).prisma;

  const cat = await db.category.create({
    data: {
      slug: "v480-stats-cat",
      moduleType: "article",
      visible: true,
      translations: { create: { locale: "zh-CN", name: "拟真测试栏目" } },
    },
  });
  categoryId = cat.id;
});

describe("服务层:展示值合成", () => {
  it("AUTO 内容:展示值按自然增长给出,且不低于真实值", async () => {
    const c = await makeContent("v480-auto-1", { viewCount: 2, likeCount: 0, shareCount: 0 });
    const map = await stats.resolveDisplayCounts([
      {
        id: c.id,
        publishedAt: c.publishAt!,
        viewCount: c.viewCount,
        likeCount: c.likeCount,
        shareCount: c.shareCount,
        statsMode: c.statsMode,
        statsBase: c.statsBase,
        statsSalt: c.statsSalt,
      },
    ]);
    const got = map.get(c.id)!;
    expect(got.views).toBeGreaterThan(100); // 10 天树龄、基数 400 → 远大于真实的 2
    expect(got.likes).toBeLessThanOrEqual(got.views);
    expect(got.shares).toBeLessThanOrEqual(got.likes);
  });

  it("单篇 OFF:即使总开关打开也只回真实值", async () => {
    const c = await makeContent("v480-off-1", { viewCount: 7, likeCount: 1, shareCount: 0, statsMode: "OFF" });
    const got = (await stats.resolveDisplayCountsById(c.id))!;
    expect(got).toEqual({ views: 7, likes: 1, shares: 0, favorites: 0 });
  });

  it("总开关关闭:所有内容回落真实值", async () => {
    const c = await makeContent("v480-disabled-1", { viewCount: 11, likeCount: 2, shareCount: 1 });
    const prev = CFG.enabled;
    CFG.enabled = false;
    try {
      const got = (await stats.resolveDisplayCountsById(c.id))!;
      expect(got).toEqual({ views: 11, likes: 2, shares: 1, favorites: 0 });
    } finally {
      CFG.enabled = prev;
    }
  });

  it("单篇与批量结果一致(列表与详情不会各说各话)", async () => {
    const c = await makeContent("v480-consistency-1", { viewCount: 3 });
    const single = (await stats.resolveDisplayCountsById(c.id))!;
    const batch = (
      await stats.resolveDisplayCounts([
        {
          id: c.id,
          publishedAt: c.publishAt!,
          viewCount: c.viewCount,
          likeCount: c.likeCount,
          shareCount: c.shareCount,
        },
      ])
    ).get(c.id)!;
    expect(single).toEqual(batch);
  });

  it("CUSTOM 基数:量级跟随管理员填写的基数", async () => {
    const plain = await makeContent("v480-custom-plain", {});
    const custom = await makeContent("v480-custom-3000", {
      statsMode: "CUSTOM",
      statsBase: 3000,
    });
    const a = (await stats.resolveDisplayCountsById(plain.id))!;
    const b = (await stats.resolveDisplayCountsById(custom.id))!;
    expect(b.views).toBeGreaterThan(a.views * 2);
  });
});

describe("真实阅读:逐日记账 + 延迟释放", () => {
  it("recordRealViewDay 按天累加(同天多次 → 一行累加)", async () => {
    const c = await makeContent("v480-daily-1");
    await stats.recordRealViewDay(c.id, daysAgo(2, 9));
    await stats.recordRealViewDay(c.id, daysAgo(2, 15));
    const rows = await db.contentDailyView.findMany({ where: { contentId: c.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].views).toBe(2);
  });

  it("increaseView:已发布内容写真实计数并记日;未发布内容两者都不记", async () => {
    const published = await makeContent("v480-view-published");
    await ugc.increaseView(published.id);
    const after = await db.content.findUnique({ where: { id: published.id } });
    expect(after?.viewCount).toBe(1);
    expect(await db.contentDailyView.count({ where: { contentId: published.id } })).toBe(1);

    const draft = await db.content.create({
      data: {
        slug: "v480-view-draft",
        categoryId,
        status: "DRAFT",
        authorName: "拟真测试",
        translations: { create: { locale: "zh-CN", title: "草稿", body: "<p>x</p>" } },
      },
    });
    await ugc.increaseView(draft.id);
    expect(await db.contentDailyView.count({ where: { contentId: draft.id } })).toBe(0);
  });

  it("真实阅读的放大是延迟到账:当天只释放一部分,数日后继续增长", async () => {
    const c = await makeContent("v480-amp-1");
    const before = (await stats.resolveDisplayCountsById(c.id))!;

    // 昨天的 3 次真实阅读:到"现在"应已释放约 66%(当天 42% + 次日 24%)
    await stats.recordRealViewDay(c.id, daysAgo(1, 9));
    await stats.recordRealViewDay(c.id, daysAgo(1, 20));
    await stats.recordRealViewDay(c.id, daysAgo(1, 21));
    const after = (await stats.resolveDisplayCountsById(c.id))!;

    const gain = after.views - before.views;
    expect(gain).toBeGreaterThanOrEqual(3); // 至少 1:1
    expect(gain).toBeLessThan(3 * CFG.amplify * 1.75); // 但还没释放完
  });

  it("同一篇内的延迟释放:真实阅读的贡献随时间只增不减(确定性比较)", async () => {
    // 说明:此用例原为"今天 vs 昨天"跨两篇内容比较取整后的差值 —— 两篇的逐日随机系数独立,
    // 量级小时会被 ±1 取整抹平(曾偶发失败)。改为同一篇内容、同一条真实阅读在两个时刻的值:
    // 无跨篇随机干扰,且严格单调。
    const c = await makeContent("v480-amp-delay");
    const at = (days: number) => new Date(Date.now() + days * 86_400_000);
    const d = new Date();
    d.setDate(d.getDate() - 1);
    await stats.recordRealViewDay(c.id, d);

    const v0 = (await stats.resolveDisplayCountsById(c.id, at(0)))!.views;
    const v1 = (await stats.resolveDisplayCountsById(c.id, at(1)))!.views;
    const v5 = (await stats.resolveDisplayCountsById(c.id, at(5)))!.views;
    expect(v1).toBeGreaterThanOrEqual(v0);
    expect(v5).toBeGreaterThan(v1);
  });
});

describe("点赞接口:回包是展示值(含本次真实操作)", () => {
  it("POST /api/interaction/like 返回拟真点赞数,且比点赞前恰好 +1", async () => {
    const c = await makeContent("v480-like-route-1", { viewCount: 0, likeCount: 0 });
    const route = (await import("@/app/api/interaction/like/route")) as typeof import("@/app/api/interaction/like/route");

    const before = (await stats.resolveDisplayCountsById(c.id))!;
    const res = await route.POST(
      new Request("http://localhost/api/interaction/like", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contentId: c.id }),
      })
    );
    const body = (await res.json()) as { ok: boolean; data: { liked: boolean; likeCount: number } };
    expect(res.status).toBe(200);
    expect(body.data.liked).toBe(true);
    expect(body.data.likeCount).toBe(before.likes + 1);
    // 真实列仍然只是 1(拟真不改真实计数)
    const row = await db.content.findUnique({ where: { id: c.id } });
    expect(row?.likeCount).toBe(1);
  });
});

describe("收藏接口:回包是展示值(V4.8.0)", () => {
  it("前台收藏切换:展示收藏数比操作前恰好 +1,真实列仍只 +1", async () => {
    const c = await makeContent("v480-fav-route-1");
    const user = await db.user.create({
      data: { email: "v480-fav-route@example.com", nickname: "收藏测试", status: "ACTIVE" },
    });
    const fav = await import("@/server/ugc/favorite");
    const before = (await stats.resolveDisplayCountsById(c.id))!;

    const res = await fav.postFavorite(
      { userId: user.id },
      new Request("http://localhost/api/interaction/favorite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contentId: c.id }),
      })
    );
    const body = (await res.json()) as {
      ok: boolean;
      data: { favorited: boolean; favoriteCount: number };
    };
    expect(res.status).toBe(200);
    expect(body.data.favorited).toBe(true);
    expect(body.data.favoriteCount).toBe(before.favorites + 1);

    const row = await db.content.findUnique({ where: { id: c.id } });
    expect(row?.favoriteCount).toBe(1); // 真实列只 +1,拟真不写库
  });

  it("服务层展示值含收藏,且收藏 ≤ 阅读", async () => {
    const c = await makeContent("v480-fav-display-1");
    const got = (await stats.resolveDisplayCountsById(c.id))!;
    expect(got.favorites).toBeGreaterThan(0); // 10 天树龄,收藏率 2% 下非零
    expect(got.favorites).toBeLessThanOrEqual(got.views);
  });
});
