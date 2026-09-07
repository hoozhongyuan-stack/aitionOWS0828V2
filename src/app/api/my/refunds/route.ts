import { z } from "zod";
import { jsonErr, jsonOk, parseBody } from "@/lib/api";
import { getUserSession } from "@/lib/auth/session";
import { applyRefund } from "@/server/order";

/** 用户发起售后(V4.2):POST {orderNo, reason};登录账号名下订单,一单一次 */
const schema = z.object({
  orderNo: z.string().min(1).max(40),
  reason: z.string().min(1).max(500),
});

export async function POST(req: Request) {
  const user = await getUserSession();
  if (!user) return jsonErr("请先登录", 401);
  const parsed = await parseBody(req, schema);
  if (parsed.error) return parsed.error;
  try {
    const refund = await applyRefund({
      orderNo: parsed.data.orderNo,
      userId: user.id,
      reason: parsed.data.reason,
    });
    return jsonOk({ id: refund.id, status: refund.status });
  } catch (e) {
    return jsonErr(e instanceof Error ? e.message : "提交失败");
  }
}
