import { z } from "zod";
import { jsonOk, jsonErr, parseBody, getClientIp } from "@/lib/api";
import { requirePerm } from "@/lib/auth/session";
import { logAdmin } from "@/server/admin";
import { runBatch, normalizeBatchIds, describeOutcome } from "@/server/batch";
import { transitionOrder } from "@/server/order";

/**
 * 订单批量流转(V4.4.2):POST /api/admin/orders/batch
 *
 * **只开放三个正向流转**:确认收款 / 标记发货 / 标记完成。
 * 有意不开放的两个动作:
 *  - `cancel`(取消订单):对经营数据破坏性大,保持单个操作;
 *  - `refund`(退款):涉及金额核定与审批流程(reviewRefund),必须逐个处理,绝不批量。
 *
 * 状态机本身会拦下非法流转(如对未付款订单"发货")——这些项计入 skipped 并回报原因,
 * 而不是让整批失败。
 */
const schema = z.object({
  ids: z.array(z.number().int()).min(1),
  action: z.enum(["confirm", "ship", "complete"]),
});

export async function POST(req: Request) {
  const guard = await requirePerm("commerce");
  const admin = "admin" in guard ? guard.admin : null;
  if ("error" in guard) return guard.error;

  const parsed = await parseBody(req, schema);
  if (parsed.error) return parsed.error;
  const norm = normalizeBatchIds(parsed.data.ids);
  if ("error" in norm) return jsonErr(norm.error);

  const { action } = parsed.data;
  const outcome = await runBatch(norm.ids, async (id) => {
    await transitionOrder(id, action);
  });

  void logAdmin({
    adminId: admin?.id ?? null,
    adminName: admin?.name ?? "?",
    action: `order.batch.${action}`,
    target: `ids:${norm.ids.slice(0, 10).join(",")}${norm.ids.length > 10 ? `…(+${norm.ids.length - 10})` : ""}`,
    detail: describeOutcome(outcome),
    ip: getClientIp(req),
  });

  return jsonOk({ ...outcome, summary: describeOutcome(outcome) });
}
