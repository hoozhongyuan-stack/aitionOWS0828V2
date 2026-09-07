import { jsonOk, getClientIp } from "@/lib/api";
import { ADMIN_COOKIE, getAdminSession } from "@/lib/auth/session";
import { logAdmin } from "@/server/admin";

/** 管理员登出:POST /api/admin/auth/logout(清除会话 cookie;V4.1 记操作日志) */
export async function POST(req: Request) {
  const admin = await getAdminSession();
  if (admin) {
    void logAdmin({ adminId: admin.id, adminName: admin.name, action: "auth.logout", ip: getClientIp(req) });
  }
  const res = jsonOk();
  res.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
