import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

/**
 * H-1 回归 + route.ts 覆盖(NFR-005 新增模块清单):
 *  - route.ts 仅允许导出 HTTP method(Next 15.5 路由类型校验器)——
 *    断言模块导出键恰为 ["POST"],requireFavoriteActor/postFavorite 不再由路由导出;
 *  - POST handler 完整链路:getActiveUserSession 登录墙(未登录 401)→ 服务切换(200/404)。
 *
 * next/headers cookies() 在 node 测试环境不可用,按 mail-integration 的 mock 手法
 * 以 vi.mock 替换 @/lib/auth/session(getActiveUserSession 由用例注入返回值)。
 */

const sessionMocks = vi.hoisted(() => ({
  getActiveUserSession: vi.fn<() => Promise<{ id: number; name: string } | null>>(),
}));

vi.mock("@/lib/auth/session", () => ({
  getActiveUserSession: sessionMocks.getActiveUserSession,
}));

type FavoriteRouteModule = typeof import("@/app/api/interaction/favorite/route");

let route: FavoriteRouteModule;
let db: PrismaClient;
let userId = 0;
let publishedId = 0;
let draftId = 0;
let categoryId = 0;

function favRequest(contentId: number): Request {
  return new Request("http://localhost/api/interaction/favorite", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contentId }),
  });
}

beforeAll(async () => {
  route = (await import("@/app/api/interaction/favorite/route")) as FavoriteRouteModule;
  db = (await import("@/lib/db")).prisma;

  const user = await db.user.create({
    data: { email: "fav-route@example.com", nickname: "路由用户", status: "ACTIVE" },
  });
  userId = user.id;
  const cat = await db.category.create({
    data: {
      slug: "fav-route-cat",
      moduleType: "news",
      translations: { create: { locale: "zh", name: "路由测试栏目" } },
    },
  });
  categoryId = cat.id;
  const published = await db.content.create({
    data: {
      slug: "fav-route-published",
      categoryId: cat.id,
      status: "PUBLISHED",
      translations: { create: { locale: "zh", title: "路由测试文章", body: "<p>x</p>" } },
    },
  });
  publishedId = published.id;
  const draft = await db.content.create({
    data: {
      slug: "fav-route-draft",
      categoryId: cat.id,
      status: "DRAFT",
      translations: { create: { locale: "zh", title: "路由测试草稿", body: "<p>x</p>" } },
    },
  });
  draftId = draft.id;
});

afterAll(async () => {
  await db.favorite.deleteMany({ where: { userId } });
  await db.content.deleteMany({ where: { categoryId } });
  await db.category.deleteMany({ where: { id: categoryId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});

describe("H-1: route.ts 仅导出 HTTP method(Next 15.5 路由类型校验器)", () => {
  it("模块导出键恰为 POST,不含 requireFavoriteActor/postFavorite 等额外导出", async () => {
    expect(Object.keys(route).sort()).toEqual(["POST"]);
    expect((route as unknown as Record<string, unknown>).requireFavoriteActor).toBeUndefined();
    expect((route as unknown as Record<string, unknown>).postFavorite).toBeUndefined();
  });
});

describe("收藏 POST handler:登录墙与切换链路(AC-021)", () => {
  it("未登录(getActiveUserSession → null)→ 401 且不产生收藏", async () => {
    sessionMocks.getActiveUserSession.mockResolvedValueOnce(null);
    const res = await route.POST(favRequest(publishedId));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; message: string };
    expect(body.ok).toBe(false);
    expect(body.message).toBe("请先登录");
    expect(await db.favorite.count({ where: { targetId: publishedId } })).toBe(0);
  });

  it("已登录 → 切换成功(200 { favorited, favoriteCount }),再调一次翻转回来", async () => {
    sessionMocks.getActiveUserSession.mockResolvedValueOnce({ id: userId, name: "路由用户" });
    const res = await route.POST(favRequest(publishedId));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: { favorited: boolean; favoriteCount: number };
    };
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({ favorited: true, favoriteCount: 1 });

    sessionMocks.getActiveUserSession.mockResolvedValueOnce({ id: userId, name: "路由用户" });
    const res2 = await route.POST(favRequest(publishedId));
    const body2 = (await res2.json()) as typeof body;
    expect(body2.data).toEqual({ favorited: false, favoriteCount: 0 });
  });

  it("已登录但目标为草稿 → 404 且计数不变", async () => {
    sessionMocks.getActiveUserSession.mockResolvedValueOnce({ id: userId, name: "路由用户" });
    const res = await route.POST(favRequest(draftId));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(false);
    expect(await db.favorite.count({ where: { targetId: draftId } })).toBe(0);
  });
});
