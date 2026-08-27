import { jsonOk } from "@/lib/api";
import { getUserSession } from "@/lib/auth/session";
import { getActiveUserInfo } from "@/server/user";

/** 当前登录用户:GET /api/auth/me(未登录/被禁用返回 null) */
export async function GET() {
  const session = await getUserSession();
  if (!session) return jsonOk(null);
  return jsonOk(await getActiveUserInfo(session.id));
}
