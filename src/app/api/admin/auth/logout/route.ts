import { jsonOk } from "@/lib/api";
import { ADMIN_COOKIE } from "@/lib/auth/session";

/** 管理员登出:POST /api/admin/auth/logout(清除会话 cookie) */
export async function POST() {
  const res = jsonOk();
  res.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
