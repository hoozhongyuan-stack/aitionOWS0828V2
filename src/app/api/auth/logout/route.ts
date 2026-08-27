import { jsonOk } from "@/lib/api";
import { USER_COOKIE } from "@/lib/auth/session";

/** 前台用户登出:POST /api/auth/logout */
export async function POST() {
  const res = jsonOk();
  res.cookies.set(USER_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
