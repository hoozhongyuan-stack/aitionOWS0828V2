import { z } from "zod";
import { jsonOk, jsonErr, parseBody, getClientIp } from "@/lib/api";
import { registerByEmail, toPublicUser } from "@/server/user";
import { signToken } from "@/lib/auth/jwt";
import { USER_COOKIE, sessionCookieOptions, guardAuthSecret } from "@/lib/auth/session";
import { rateLimit } from "@/lib/ugc/anti-spam";

/**
 * 邮箱注册:POST /api/auth/register(需求 4.6)
 * 必须勾选协议;注册成功自动登录(30 天会话)。
 */
const schema = z.object({
  email: z.string().email("邮箱格式不正确"),
  password: z.string().min(8, "密码至少 8 位").max(64),
  nickname: z.string().max(30).optional(),
  agree: z.literal(true, { errorMap: () => ({ message: "请先阅读并同意用户协议与隐私政策" }) }),
});

export async function POST(req: Request) {
  const secretBlock = guardAuthSecret();
  if (secretBlock) return secretBlock;

  const parsed = await parseBody(req, schema);
  if (parsed.error) return parsed.error;

  const ip = getClientIp(req);
  if (!rateLimit(`register:${ip}`, 5, 3600_000)) return jsonErr("注册过于频繁,请稍后再试", 429);

  try {
    const user = await registerByEmail(parsed.data);
    const token = await signToken(
      { sub: String(user.id), typ: "user", name: user.nickname || "用户" },
      "30d"
    );
    // 前台响应统一经白名单序列化:绝不携带公司/地区资料字段(NFR-001)
    const res = jsonOk(toPublicUser(user));
    res.cookies.set(USER_COOKIE, token, sessionCookieOptions(30 * 24 * 3600));
    return res;
  } catch (e) {
    return jsonErr(e instanceof Error ? e.message : "注册失败");
  }
}
