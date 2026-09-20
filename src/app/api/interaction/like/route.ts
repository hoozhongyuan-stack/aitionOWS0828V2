import { z } from "zod";
import { jsonOk, jsonErr, parseBody, getClientIp } from "@/lib/api";
import { getUserSession, getActiveUserSession, GUEST_COOKIE } from "@/lib/auth/session";
import { getFeatureFlags } from "@/lib/config";
import { toggleLike, hasLiked } from "@/server/ugc";
import { resolveDisplayCountsById } from "@/server/stats";
import { getOrCreateGuestKey, guestCookieOptions, rateLimit } from "@/lib/ugc/anti-spam";

/**
 * 点赞:POST(切换)/ GET ?contentId=(查询状态)
 * 游客/登录用户均可(需求 4.8);游客用 httpOnly 指纹 cookie 去重;IP 限频防刷。
 */
const schema = z.object({ contentId: z.number().int() });

export async function POST(req: Request) {
  const features = await getFeatureFlags();
  if (!features.like) return jsonErr("点赞功能未开启", 403);

  const parsed = await parseBody(req, schema);
  if (parsed.error) return parsed.error;

  const ip = getClientIp(req);
  if (!rateLimit(`like:${ip}`, 30, 60_000)) return jsonErr("操作过于频繁,请稍后再试", 429);

  // 登录点赞需为有效账号;封禁用户直接拒绝(若静默降级为游客身份,等于架空封禁)
  const raw = await getUserSession();
  const user = raw ? await getActiveUserSession() : null;
  if (raw && !user) return jsonErr("账号已被禁用", 403);
  const guest = user ? null : await getOrCreateGuestKey();

  try {
    const result = await toggleLike({
      contentId: parsed.data.contentId,
      userId: user?.id ?? null,
      guestKey: guest?.key ?? null,
    });
    // V4.8.0:回包用展示值(拟真层)+ 本次真实操作 —— 前台点一下正好 +1,不会跳回真实值
    const display = await resolveDisplayCountsById(parsed.data.contentId);
    const res = jsonOk(
      display ? { liked: result.liked, likeCount: display.likes } : result
    );
    if (guest?.isNew) res.cookies.set(GUEST_COOKIE, guest.key, guestCookieOptions());
    return res;
  } catch (e) {
    return jsonErr(e instanceof Error ? e.message : "操作失败");
  }
}

export async function GET(req: Request) {
  const contentId = Number(new URL(req.url).searchParams.get("contentId"));
  if (!contentId) return jsonOk({ liked: false });
  const user = await getUserSession();
  const guest = user ? null : await getOrCreateGuestKey();
  const liked = await hasLiked({
    contentId,
    userId: user?.id ?? null,
    guestKey: guest && !guest.isNew ? guest.key : null,
  });
  return jsonOk({ liked });
}
