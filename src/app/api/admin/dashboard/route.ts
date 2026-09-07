import { jsonOk, jsonErr } from "@/lib/api";
import { requireOwner } from "@/lib/auth/session";
import { getDashboardStats, DashboardRangeError } from "@/server/analytics";

/**
 * 看板数据:GET /api/admin/dashboard
 * V3.1(REQ-005):支持可选查询参数 from/to(YYYY-MM-DD,成对,跨度≤92 天)
 * 返回区间逐日序列 range.series;非法参数 400 jsonErr;无参数响应结构与既有契约兼容。查询值空串视为未传(与 UI 行为一致;评审 Low-5 口径)。
 */
export async function GET(request: Request) {
  const guard = await requireOwner();
  if ("error" in guard) return guard.error;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;

  try {
    return jsonOk(await getDashboardStats(from, to));
  } catch (e) {
    // 400 语义错误(from/to 单边/格式/跨度)由服务层声明,路由层映射 HTTP 状态
    if (e instanceof DashboardRangeError) return jsonErr(e.message, e.status);
    throw e;
  }
}
