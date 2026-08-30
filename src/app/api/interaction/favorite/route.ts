import { z } from "zod";
import { jsonOk, jsonErr, parseBody } from "@/lib/api";
import { getActiveUserSession } from "@/lib/auth/session";
import { toggleFavorite, FavoriteTargetNotFoundError } from "@/server/ugc";

/**
 * 收藏切换(需求 V3.0 REQ-005):POST /api/interaction/favorite
 * body { contentId:number };一次调用 = 一次状态翻转,返回 { favorited, favoriteCount }。
 * 登录墙:未登录/会话失效/账号被禁用一律 401(被禁用者视同未登录);
 * 目标不存在或未发布 → 404 且 favoriteCount 不变。
 */

const schema = z.object({ contentId: z.number().int() });

export interface FavoriteActor {
  userId: number;
}

/**
 * 登录墙薄封装(AC-021):无有效登录会话 → 401 jsonErr。
 * 独立为纯函数,便于在无 next/headers 请求作用域的 vitest(node)环境中
 * 直接验证 401 语义(TEST-008);POST 内部以 getActiveUserSession 的结果调用之。
 */
export function requireFavoriteActor(
  session: { id: number } | null | undefined
): { actor: FavoriteActor; error?: undefined } | { actor?: undefined; error: ReturnType<typeof jsonErr> } {
  if (!session || !session.id) return { error: jsonErr("请先登录", 401) };
  return { actor: { userId: session.id } };
}

/** 登录墙之后的切换处理(薄封装,测试可绕过 cookies() 直连) */
export async function postFavorite(actor: FavoriteActor, req: Request) {
  const parsed = await parseBody(req, schema);
  if (parsed.error) return parsed.error;
  try {
    const result = await toggleFavorite({
      contentId: parsed.data.contentId,
      userId: actor.userId,
    });
    return jsonOk(result);
  } catch (e) {
    if (e instanceof FavoriteTargetNotFoundError) return jsonErr(e.message, 404);
    return jsonErr(e instanceof Error ? e.message : "操作失败");
  }
}

export async function POST(req: Request) {
  const session = await getActiveUserSession();
  const walled = requireFavoriteActor(session);
  if (walled.error) return walled.error;
  return postFavorite(walled.actor, req);
}
