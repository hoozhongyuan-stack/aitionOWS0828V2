import { z } from "zod";
import { jsonOk, jsonErr, parseBody, getClientIp } from "@/lib/api";
import { rateLimit } from "@/lib/ugc/anti-spam";
import { requestPasswordReset } from "@/server/user/password-reset";

/**
 * 申请密码重置邮件。
 * 无论邮箱是否注册都返回 ok(防账号枚举);
 * 仅当 SMTP 未配置/发送失败时返回错误(用户需要知道"联系管理员")。
 */

const schema = z.object({
  email: z.string().email("邮箱格式不正确"),
  locale: z.string().max(10).optional(),
});

export async function POST(req: Request) {
  const ip = getClientIp(req);
  // 限频:同 IP 10 分钟内最多 5 次申请
  if (!rateLimit(`pw-forgot:${ip}`, 5, 10 * 60 * 1000)) {
    return jsonErr("请求过于频繁,请稍后再试", 429);
  }

  const p = await parseBody(req, schema);
  if (p.error) return p.error;

  try {
    await requestPasswordReset(p.data.email, p.data.locale ?? "zh-CN");
    return jsonOk({ sent: true });
  } catch (e) {
    return jsonErr(e instanceof Error ? e.message : "发送失败,请稍后再试");
  }
}
