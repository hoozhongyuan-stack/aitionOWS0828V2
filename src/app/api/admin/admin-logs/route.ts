import { jsonOk } from "@/lib/api";
import { requireOwner } from "@/lib/auth/session";
import { listAdminLogs } from "@/server/admin";

/** 操作日志查询(V4.1,主账号专属):GET ?adminId=&actionPrefix=&from=&to=&page=&pageSize= */
export async function GET(req: Request) {
  const guard = await requireOwner();
  if ("error" in guard) return guard.error;
  const sp = new URL(req.url).searchParams;
  return jsonOk(
    await listAdminLogs({
      adminId: Number(sp.get("adminId")) || undefined,
      actionPrefix: sp.get("actionPrefix") || undefined,
      from: sp.get("from") || undefined,
      to: sp.get("to") || undefined,
      page: Number(sp.get("page")) || 1,
      pageSize: Number(sp.get("pageSize")) || 10,
    })
  );
}
