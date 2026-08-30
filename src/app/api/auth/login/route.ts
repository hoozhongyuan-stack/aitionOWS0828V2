import { z } from "zod";
import { jsonOk, jsonErr, parseBody, getClientIp } from "@/lib/api";
import { loginByEmail, toPublicUser } from "@/server/user";
import { signToken } from "@/lib/auth/jwt";
import { USER_COOKIE, sessionCookieOptions, guardAuthSecret } from "@/lib/auth/session";
import { rateLimit } from "@/lib/ugc/anti-spam";

/** 邮箱登录:POST /api/auth/login(需求 4.6) */
const schema = z.object({
  email: z.string().email("邮箱格式不正确"),
  password: z.string().min(1, "请输入密码"),
});

export async function POST(req: Request) {
  const secretBlock = guardAuthSecret();
  if (secretBlock) return secretBlock;

  const parsed = await parseBody(req, schema);
  if (parsed.error) return parsed.error;

  const ip = getClientIp(req);
  if (!rateLimit(`ulogin:${ip}`, 10, 600_000)) return jsonErr("尝试过于频繁,请稍后再试", 429);

  try {
    const user = await loginByEmail(parsed.data);
    const token = await signToken(
      { sub: String(user.id), typ: "user", name: user.nickname || user.email || "用户" },
      "30d"
    );
    // 前台响应统一经白名单序列化:绝不携带公司/地区资料字段(NFR-001)
    const res = jsonOk(toPublicUser(user));
    res.cookies.set(USER_COOKIE, token, sessionCookieOptions(30 * 24 * 3600));
    return res;
  } catch (e) {
    return jsonErr(e instanceof Error ? e.message : "登录失败", 401);
  }
}
