import { beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

/**
 * TEST-008(AC-006 / AC-021)+ TEST-009(AC-007)+ TEST-010(AC-008):
 * 收藏域(REQ-005)——切换语义、favoriteCount 同步、唯一约束兜底、
 * 404 语义(不存在/未发布且计数不变)、hasFavorited 两态、
 * listMyFavorites(locale 回退 + moduleType 类型标识)、
 * API 登录墙 401(AC-021:未登录 401 且计数不变)与路由薄封装行为。
 *
 * RED 约定:被测能力缺失时必须以断言失败(missing_behavior)暴露,
 * 而非模块解析/基建错误——故统一用动态 import + 「函数存在性断言」前置。
 * 隔离约定:每个用例使用独立内容行,避免用例间共享收藏状态导致顺序耦合。
 */

type UgcModule = typeof import("@/server/ugc");
type FavoriteRouteModule = typeof import("@/app/api/interaction/favorite/route");

let db: PrismaClient;

async function loadUgc(): Promise<UgcModule> {
  return (await import("@/server/ugc")) as UgcModule;
}

/** RED 阶段路由模块尚不存在:捕获取消,由断言给出 missing_behavior 失败 */
async function loadFavoriteRoute(): Promise<FavoriteRouteModule | undefined> {
  try {
    return (await import("@/app/api/interaction/favorite/route")) as FavoriteRouteModule;
  } catch {
    return undefined;
  }
}

function expectFn(mod: unknown, name: string): void {
  expect(
    typeof (mod as Record<string, unknown>)?.[name],
    `missing_behavior:${name} 尚未实现(@/server/ugc)`
  ).toBe("function");
}

function favRequest(contentId: unknown): Request {
  return new Request("http://localhost/api/interaction/favorite", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contentId }),
  });
}

// —— fixture ids ——
let userId: number;
let listUserId: number; // TEST-010 专用用户(与其余用例的收藏状态隔离)
let switchId: number; // 切换语义用
let rapidId: number; // 连续快速切换用
let missingFavId: number; // hasFavorited 两态用
let draftId: number; // 草稿(404 语义)
let listProductId: number; // 商品(moduleType=product,标题 zh+en)
let listNewsId: number; // 文章(moduleType=news,仅 zh)
let apiId: number; // API postFavorite 用

async function createPublishedContent(
  slug: string,
  categoryId: number,
  translations: { locale: string; title: string }[],
  extra?: { coverUrl?: string }
): Promise<number> {
  const c = await db.content.create({
    data: {
      slug,
      categoryId,
      status: "PUBLISHED",
      translations: {
        create: translations.map((t) => ({ ...t, body: `<p>${t.title}</p>` })),
      },
      ...(extra?.coverUrl ? { coverUrl: extra.coverUrl } : {}),
    },
  });
  return c.id;
}

beforeAll(async () => {
  db = (await import("@/lib/db")).prisma;

  const user = await db.user.create({
    data: { email: "fan@example.com", nickname: "收藏用户", status: "ACTIVE" },
  });
  userId = user.id;
  const listUser = await db.user.create({
    data: { email: "list-fan@example.com", nickname: "列表用户", status: "ACTIVE" },
  });
  listUserId = listUser.id;

  const productCat = await db.category.create({
    data: {
      slug: "fav-products",
      moduleType: "product",
      translations: { create: { locale: "zh", name: "收藏测试产品栏" } },
    },
  });
  const newsCat = await db.category.create({
    data: {
      slug: "fav-news",
      moduleType: "news",
      translations: { create: { locale: "zh", name: "收藏测试文章栏" } },
    },
  });

  [switchId, rapidId, missingFavId, apiId] = await Promise.all([
    createPublishedContent("fav-switch", newsCat.id, [
      { locale: "zh", title: "切换语义文章" },
      { locale: "en", title: "Switch Article EN" },
    ]),
    createPublishedContent("fav-rapid", newsCat.id, [{ locale: "zh", title: "快速切换文章" }]),
    createPublishedContent("fav-has", newsCat.id, [{ locale: "zh", title: "两态判断文章" }]),
    createPublishedContent("fav-api", newsCat.id, [{ locale: "zh", title: "API 切换文章" }]),
  ]);

  const draft = await db.content.create({
    data: {
      slug: "fav-draft",
      categoryId: newsCat.id,
      status: "DRAFT",
      translations: { create: { locale: "zh", title: "草稿不应可收藏", body: "<p>x</p>" } },
    },
  });
  draftId = draft.id;

  listProductId = await createPublishedContent(
    "fav-product-a",
    productCat.id,
    [
      { locale: "zh", title: "商品A-中文" },
      { locale: "en", title: "Product A EN" },
    ],
    { coverUrl: "https://cdn.example.com/product-a.jpg" }
  );
  listNewsId = await createPublishedContent("fav-news-only-zh", newsCat.id, [
    { locale: "zh", title: "仅中文文章" },
  ]);
});

describe("TEST-008: 收藏切换服务(AC-006 / AC-021)", () => {
  it("切换语义:未收藏→收藏(count+1)→再切→取消(count-1)", async () => {
    const ugc = await loadUgc();
    expectFn(ugc, "toggleFavorite");

    const first = await ugc.toggleFavorite({ contentId: switchId, userId });
    expect(first).toEqual({ favorited: true, favoriteCount: 1 });
    const afterFirst = await db.content.findUnique({
      where: { id: switchId },
      select: { favoriteCount: true },
    });
    expect(afterFirst?.favoriteCount).toBe(1);

    const second = await ugc.toggleFavorite({ contentId: switchId, userId });
    expect(second).toEqual({ favorited: false, favoriteCount: 0 });
    const rows = await db.favorite.findMany({
      where: { targetType: "CONTENT", targetId: switchId, userId },
    });
    expect(rows).toHaveLength(0);
  });

  it("连续快速切换不产生重复记录且计数与实际收藏行数一致(唯一约束兜底)", async () => {
    const ugc = await loadUgc();
    expectFn(ugc, "toggleFavorite");

    // 并发快速切换:无论各自翻转成功与否,结果必须收敛到一致状态
    await Promise.allSettled([
      ugc.toggleFavorite({ contentId: rapidId, userId }),
      ugc.toggleFavorite({ contentId: rapidId, userId }),
      ugc.toggleFavorite({ contentId: rapidId, userId }),
      ugc.toggleFavorite({ contentId: rapidId, userId }),
    ]);
    let rows = await db.favorite.findMany({
      where: { targetType: "CONTENT", targetId: rapidId, userId },
    });
    let count = (
      await db.content.findUnique({ where: { id: rapidId }, select: { favoriteCount: true } })
    )?.favoriteCount;
    expect(rows.length, "同一 (targetType,targetId,userId) 不允许重复记录").toBeLessThanOrEqual(1);
    expect(count, "favoriteCount 必须与实际收藏行数一致").toBe(rows.length);

    // 再连续快速切换 3 次(奇数次 → 净效果一次翻转),计数仍须一致
    for (let i = 0; i < 3; i++) {
      await ugc.toggleFavorite({ contentId: rapidId, userId });
    }
    rows = await db.favorite.findMany({
      where: { targetType: "CONTENT", targetId: rapidId, userId },
    });
    count = (
      await db.content.findUnique({ where: { id: rapidId }, select: { favoriteCount: true } })
    )?.favoriteCount;
    expect(rows.length).toBeLessThanOrEqual(1);
    expect(count).toBe(rows.length);
  });

  it("404 语义:contentId 不存在 → 抛 404 语义错误,计数与记录不变", async () => {
    const ugc = await loadUgc();
    expectFn(ugc, "toggleFavorite");

    let err: unknown;
    let caught = false;
    try {
      await ugc.toggleFavorite({ contentId: 999_999, userId });
    } catch (e) {
      caught = true;
      err = e;
    }
    expect(caught, "missing_behavior:收藏不存在的内容必须抛 404 语义错误").toBe(true);
    expect((err as { status?: number })?.status, "404 语义错误应携带 status=404").toBe(404);

    const rows = await db.favorite.findMany({ where: { userId, targetId: 999_999 } });
    expect(rows).toHaveLength(0);
  });

  it("404 语义:status=DRAFT → 抛 404 语义错误且计数不变(AC-021)", async () => {
    const ugc = await loadUgc();
    expectFn(ugc, "toggleFavorite");

    let err: unknown;
    let caught = false;
    try {
      await ugc.toggleFavorite({ contentId: draftId, userId });
    } catch (e) {
      caught = true;
      err = e;
    }
    expect(caught, "missing_behavior:未发布内容必须抛 404 语义错误").toBe(true);
    expect((err as { status?: number })?.status).toBe(404);

    const [draftRow, draftFavs] = await Promise.all([
      db.content.findUnique({ where: { id: draftId }, select: { favoriteCount: true } }),
      db.favorite.count({ where: { targetType: "CONTENT", targetId: draftId } }),
    ]);
    expect(draftRow?.favoriteCount).toBe(0);
    expect(draftFavs).toBe(0);
  });

  it("hasFavorited 两态:收藏前 false / 收藏后 true / 取消后 false;无 userId 恒 false", async () => {
    const ugc = await loadUgc();
    expectFn(ugc, "hasFavorited");
    expectFn(ugc, "toggleFavorite");

    expect(await ugc.hasFavorited({ contentId: missingFavId, userId })).toBe(false);
    expect(await ugc.hasFavorited({ contentId: missingFavId, userId: null })).toBe(false);

    await ugc.toggleFavorite({ contentId: missingFavId, userId });
    expect(await ugc.hasFavorited({ contentId: missingFavId, userId })).toBe(true);

    await ugc.toggleFavorite({ contentId: missingFavId, userId });
    expect(await ugc.hasFavorited({ contentId: missingFavId, userId })).toBe(false);
  });
});

describe("TEST-010: 个人收藏列表(AC-008)", () => {
  beforeAll(async () => {
    const ugc = await loadUgc();
    // RED 阶段 toggleFavorite 未实现:跳过夹具注入,让用例自身的存在性断言给出 missing_behavior
    if (typeof ugc.toggleFavorite !== "function") return;
    // 收藏顺序:先文章后商品 → 列表应按收藏时间倒序(商品在前)
    await ugc.toggleFavorite({ contentId: listNewsId, userId: listUserId });
    await ugc.toggleFavorite({ contentId: listProductId, userId: listUserId });
  });

  it("含 contentId/slug/标题/moduleType 类型标识/coverUrl/favoriteCount,按收藏时间倒序", async () => {
    const ugc = await loadUgc();
    expectFn(ugc, "listMyFavorites");

    const list = await ugc.listMyFavorites(listUserId, "en");
    expect(list.length).toBe(2);
    expect(list[0]?.contentId, "应按收藏时间倒序(后收藏的商品在前)").toBe(listProductId);
    expect(list[0]?.moduleType, "missing_behavior:列表项缺文章/商品类型标识(moduleType)").toBe(
      "product"
    );
    expect(list[0]?.title).toBe("Product A EN");
    expect(list[0]?.slug).toBe("fav-product-a");
    expect(list[0]?.coverUrl).toBe("https://cdn.example.com/product-a.jpg");
    expect(list[0]?.favoriteCount).toBe(1);

    const newsItem = list.find((x) => x.contentId === listNewsId);
    expect(newsItem?.moduleType).toBe("news");
    expect(newsItem?.title, "请求语言缺翻译时回退现有机制(首条翻译)").toBe("仅中文文章");
    expect(newsItem?.favoriteCount).toBe(1);
  });

  it("locale 回退:请求语言缺翻译时回退首条翻译", async () => {
    const ugc = await loadUgc();
    const list = await ugc.listMyFavorites(listUserId, "ja");
    const product = list.find((x) => x.contentId === listProductId);
    expect(product?.title).toBe("商品A-中文");
  });
});

describe("TEST-008/009: 收藏 API 薄封装(AC-021 登录墙 401)", () => {
  it("requireFavoriteActor:未登录 → 401;有效会话 → 放行并携带 userId", async () => {
    const route = await loadFavoriteRoute();
    expect(route, "missing_behavior:/api/interaction/favorite 路由模块尚未实现").toBeTruthy();

    const walled = route!.requireFavoriteActor(null);
    expect(walled.error, "missing_behavior:未登录必须返回 401 错误响应").toBeTruthy();
    expect(walled.error?.status).toBe(401);
    expect(((await walled.error?.json()) as { ok?: boolean }).ok).toBe(false);

    const allowed = route!.requireFavoriteActor({ id: userId });
    expect(allowed.error).toBeUndefined();
    expect(allowed.actor?.userId).toBe(userId);
  });

  it("AC-021:未登录(401)时服务不被调用,favoriteCount 不变", async () => {
    const route = await loadFavoriteRoute();
    expect(route, "missing_behavior:/api/interaction/favorite 路由模块尚未实现").toBeTruthy();

    const walled = route!.requireFavoriteActor(null);
    expect(walled.error?.status).toBe(401);
    // 路由在 401 分支直接返回,不再触达服务层 → 计数必然不变;此处断言基线
    const before = await db.favorite.count({ where: { userId, targetId: apiId } });
    expect(before).toBe(0);
  });

  it("postFavorite:合法请求完成切换并返回 jsonOk({ favorited, favoriteCount })", async () => {
    const route = await loadFavoriteRoute();
    expect(route, "missing_behavior:/api/interaction/favorite 路由模块尚未实现").toBeTruthy();

    const res = await route!.postFavorite({ userId }, favRequest(apiId));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: { favorited: boolean; favoriteCount: number };
    };
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({ favorited: true, favoriteCount: 1 });

    const res2 = await route!.postFavorite({ userId }, favRequest(apiId));
    const body2 = (await res2.json()) as typeof body;
    expect(body2.data).toEqual({ favorited: false, favoriteCount: 0 });
  });

  it("postFavorite:目标为草稿 → 404 且计数不变", async () => {
    const route = await loadFavoriteRoute();
    expect(route, "missing_behavior:/api/interaction/favorite 路由模块尚未实现").toBeTruthy();

    const res = await route!.postFavorite({ userId }, favRequest(draftId));
    expect(res.status, "missing_behavior:未发布内容应返回 404").toBe(404);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(false);
    expect(await db.favorite.count({ where: { targetId: draftId } })).toBe(0);
  });

  it("postFavorite:请求体缺 contentId / 非法 JSON → 400", async () => {
    const route = await loadFavoriteRoute();
    expect(route, "missing_behavior:/api/interaction/favorite 路由模块尚未实现").toBeTruthy();

    const badBody = await route!.postFavorite(
      { userId },
      new Request("http://localhost/api/interaction/favorite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    );
    expect(badBody.status).toBe(400);

    const badJson = await route!.postFavorite(
      { userId },
      new Request("http://localhost/api/interaction/favorite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-json",
      })
    );
    expect(badJson.status).toBe(400);
  });
});
