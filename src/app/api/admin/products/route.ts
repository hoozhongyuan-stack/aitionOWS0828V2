import { jsonOk } from "@/lib/api";
import { requirePerm } from "@/lib/auth/session";
import { listProductsAdmin, listProductCategories } from "@/server/content";

/** 商品管理列表(V4.2,交易组权限):数据为 Content(product 栏目),管理入口在交易模块 */
export async function GET(req: Request) {
  const guard = await requirePerm("commerce");
  if ("error" in guard) return guard.error;
  const sp = new URL(req.url).searchParams;
  const data = await listProductsAdmin({
    keyword: sp.get("keyword") || undefined,
    categoryId: Number(sp.get("categoryId")) || undefined,
    status: sp.get("status") || undefined,
    page: Number(sp.get("page")) || 1,
    pageSize: Number(sp.get("pageSize")) || 10,
  });
  const categories = await listProductCategories();
  return jsonOk({ ...data, categories });
}
