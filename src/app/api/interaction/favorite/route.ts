import { getActiveUserSession } from "@/lib/auth/session";
import { requireFavoriteActor, postFavorite } from "@/server/ugc/favorite";

/**
 * 收藏切换(需求 V3.0 REQ-005):POST /api/interaction/favorite
 * body { contentId:number };一次调用 = 一次状态翻转,返回 { favorited, favoriteCount }。
 * 登录墙:未登录/会话失效/账号被禁用一律 401(被禁用者视同未登录);
 * 目标不存在或未发布 → 404 且 favoriteCount 不变。
 *
 * Next 15.5 路由类型校验器要求 route.ts 仅导出 HTTP method:
 * requireFavoriteActor/postFavorite 已拆至 @/server/ugc/favorite(测试从该路径导入)。
 */
export async function POST(req: Request) {
  const session = await getActiveUserSession();
  const walled = requireFavoriteActor(session);
  if (walled.error) return walled.error;
  return postFavorite(walled.actor, req);
}
