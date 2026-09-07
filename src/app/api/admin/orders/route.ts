import { z } from "zod";
import { jsonErr, jsonOk, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { getOrderAdmin, listOrdersAdmin, transitionOrder, type OrderAction } from "@/server/order";

/**
 * 后台订单管理(V4.0):
 * - GET  列表(?status=&q=&page=&pageSize=)或详情(?id=)
 * - POST 状态流转 {id, action: confirm|ship|complete|cancel, adminNote?}
 */

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const sp = new URL(req.url).searchParams;
  const id = Number(sp.get("id"));
  if (id > 0) {
    const order = await getOrderAdmin(id);
    if (!order) return jsonErr("订单不存在", 404);
    return jsonOk(order);
  }
  return jsonOk(
    await listOrdersAdmin({
      status: sp.get("status") ?? undefined,
      q: sp.get("q") ?? undefined,
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
      page: Number(sp.get("page")) || 1,
      pageSize: Number(sp.get("pageSize")) || 20,
    })
  );
}

const actionSchema = z.object({
  id: z.number().int().positive(),
  action: z.enum(["confirm", "ship", "complete", "cancel"]),
  adminNote: z.string().max(500).optional(),
  shippingCarrier: z.string().max(80).optional(), // V4.0.1 发货物流(非必填)
  trackingNumber: z.string().max(80).optional(),
});

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const parsed = await parseBody(req, actionSchema);
  if (parsed.error) return parsed.error;
  try {
    const order = await transitionOrder(parsed.data.id, parsed.data.action as OrderAction, {
      adminNote: parsed.data.adminNote,
      shippingCarrier: parsed.data.shippingCarrier,
      trackingNumber: parsed.data.trackingNumber,
    });
    return jsonOk(order);
  } catch (e) {
    return jsonErr(e instanceof Error ? e.message : "操作失败");
  }
}
