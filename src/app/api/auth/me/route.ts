import { jsonOk } from "@/lib/api";
import { getUserSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { USER_STATUS } from "@/types/domain";

/** 当前登录用户:GET /api/auth/me(未登录/被禁用返回 null) */
export async function GET() {
  const session = await getUserSession();
  if (!session) return jsonOk(null);
  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user || user.status !== USER_STATUS.ACTIVE) return jsonOk(null);
  return jsonOk({
    id: user.id,
    email: user.email,
    nickname: user.nickname || user.email?.split("@")[0] || `用户${user.id}`,
  });
}
