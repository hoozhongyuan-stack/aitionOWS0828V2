import { jsonOk } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { getDashboardStats } from "@/server/analytics";

/** 看板数据:GET /api/admin/dashboard */
export async function GET() {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  return jsonOk(await getDashboardStats());
}
