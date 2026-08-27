import { z } from "zod";
import { jsonOk, jsonErr, parseBody, getClientIp } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getFeatureFlags } from "@/lib/config";
import { submitUserContent, listMySubmissions } from "@/server/ugc";
import { rateLimit } from "@/lib/ugc/anti-spam";

/**
 * 用户投稿:POST 提交(登录 + 总开关 + 栏目许可)/ GET 我的投稿列表
 * 提交后进入审核队列(PENDING),审核通过才上线(需求 4.8)。
 */

const postSchema = z.object({
  categoryId: z.number().int(),
  locale: z.string().min(2),
  title: z.string().min(1, "请输入标题").max(120),
  summary: z.string().max(500).nullable(),
  body: z.string().min(10, "正文内容过短"),
  coverUrl: z.string().nullable(),
});

export async function POST(req: Request) {
  const features = await getFeatureFlags();
  if (!features.submission) return jsonErr("投稿功能暂未开放", 403);

  const guard = await requireUser();
  if ("error" in guard) return guard.error;

  const parsed = await parseBody(req, postSchema);
  if (parsed.error) return parsed.error;

  const ip = getClientIp(req);
  if (!rateLimit(`submission:${guard.user.id}`, 5, 3600_000) || !rateLimit(`submission:${ip}`, 10, 3600_000)) {
    return jsonErr("投稿过于频繁,请稍后再试", 429);
  }

  try {
    const content = await submitUserContent({ userId: guard.user.id, ...parsed.data });
    return jsonOk({ id: content.id });
  } catch (e) {
    return jsonErr(e instanceof Error ? e.message : "投稿失败");
  }
}

export async function GET() {
  const guard = await requireUser();
  if ("error" in guard) return guard.error;
  return jsonOk(await listMySubmissions(guard.user.id));
}
