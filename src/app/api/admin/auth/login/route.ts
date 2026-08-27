import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonOk, jsonErr, parseBody, getClientIp } from "@/lib/api";
import { verifyPassword } from "@/lib/auth/password";
import { signToken } from "@/lib/auth/jwt";
import { ADMIN_COOKIE, sessionCookieOptions, guardAuthSecret } from "@/lib/auth/session";
import { getSecurityConfig } from "@/lib/config";

/**
 * 管理员登录:POST /api/admin/auth/login
 * - bcrypt 校验 + JWT(httpOnly cookie,7 天)
 * - 内存级防爆破:同 IP 10 分钟内最多失败 10 次
 * - 返回 mustChangePw:默认密码未改时为 true,前端强制跳转改密页
 */

const schema = z.object({
  username: z.string().min(1, "请输入用户名"),
  password: z.string().min(1, "请输入密码"),
});

// 登录失败计数(进程内存;单体部署足够)
const g = globalThis as unknown as { __loginFails?: Map<string, { n: number; ts: number }> };
const fails = (g.__loginFails ??= new Map());
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS = 10;

export async function POST(req: Request) {
  const secretBlock = guardAuthSecret();
  if (secretBlock) return secretBlock;

  const parsed = await parseBody(req, schema);
  if (parsed.error) return parsed.error;
  const { username, password } = parsed.data;

  const ip = getClientIp(req);
  const rec = fails.get(ip);
  if (rec && Date.now() - rec.ts < WINDOW_MS && rec.n >= MAX_FAILS) {
    return jsonErr("失败次数过多,请 10 分钟后再试", 429);
  }

  const admin = await prisma.adminUser.findUnique({ where: { username } });
  const ok = admin && (await verifyPassword(password, admin.passwordHash));
  if (!ok) {
    const cur = rec && Date.now() - rec.ts < WINDOW_MS ? rec : { n: 0, ts: Date.now() };
    fails.set(ip, { n: cur.n + 1, ts: cur.ts });
    return jsonErr("用户名或密码错误", 401);
  }
  fails.delete(ip);

  await prisma.adminUser.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });

  const token = await signToken(
    { sub: String(admin.id), typ: "admin", name: admin.displayName || admin.username },
    "7d"
  );
  const security = await getSecurityConfig();

  const res = jsonOk({ mustChangePw: !security.defaultPwChanged });
  res.cookies.set(ADMIN_COOKIE, token, sessionCookieOptions(7 * 24 * 3600));
  return res;
}
