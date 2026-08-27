import { z } from "zod";
import { jsonOk, jsonErr, parseBody, getClientIp } from "@/lib/api";
import { getUserSession } from "@/lib/auth/session";
import { getFeatureFlags } from "@/lib/config";
import { listApprovedComments, submitComment } from "@/server/ugc";
import { rateLimit } from "@/lib/ugc/anti-spam";

/**
 * 评论:GET ?contentId=(仅返回已审核)/ POST 提交(默认 PENDING)
 * 需求 4.8:评论开关 + 是否需登录开关;敏感词过滤;限频防刷。
 */

const postSchema = z.object({
  contentId: z.number().int(),
  body: z.string().min(1, "评论内容不能为空").max(1000),
  guestName: z.string().max(30).optional(),
});

export async function GET(req: Request) {
  const contentId = Number(new URL(req.url).searchParams.get("contentId"));
  if (!contentId) return jsonErr("缺少 contentId");
  return jsonOk(await listApprovedComments(contentId));
}

export async function POST(req: Request) {
  const features = await getFeatureFlags();
  if (!features.comment) return jsonErr("评论功能未开启", 403);

  const parsed = await parseBody(req, postSchema);
  if (parsed.error) return parsed.error;

  const user = await getUserSession();
  if (features.commentLoginRequired && !user) return jsonErr("请登录后评论", 401);

  const ip = getClientIp(req);
  if (!rateLimit(`comment:${ip}`, 5, 60_000)) return jsonErr("评论太频繁,请稍后再试", 429);

  try {
    await submitComment({
      contentId: parsed.data.contentId,
      body: parsed.data.body,
      userId: user?.id ?? null,
      guestName: parsed.data.guestName ?? null,
      ip,
    });
    return jsonOk({ pending: true });
  } catch (e) {
    return jsonErr(e instanceof Error ? e.message : "提交失败");
  }
}
