import { z } from "zod";
import { jsonOk, jsonErr, parseBody, getClientIp } from "@/lib/api";
import { rateLimit } from "@/lib/ugc/anti-spam";
import { resetPasswordWithToken } from "@/server/user/password-reset";

/** 用邮件里的令牌重置密码 */

const schema = z.object({
  token: z.string().min(16, "链接参数不完整"),
  password: z.string().min(8, "密码至少 8 位").max(72, "密码过长"),
});

export async function POST(req: Request) {
  const ip = getClientIp(req);
  // 限频:防暴力试令牌
  if (!rateLimit(`pw-reset:${ip}`, 10, 10 * 60 * 1000)) {
    return jsonErr("请求过于频繁,请稍后再试", 429);
  }

  const p = await parseBody(req, schema);
  if (p.error) return p.error;

  try {
    await resetPasswordWithToken(p.data.token, p.data.password);
    return jsonOk({ reset: true });
  } catch (e) {
    return jsonErr(e instanceof Error ? e.message : "重置失败,请重新申请");
  }
}
