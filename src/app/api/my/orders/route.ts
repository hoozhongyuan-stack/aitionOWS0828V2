import { jsonErr, jsonOk } from "@/lib/api";
import { getUserSession } from "@/lib/auth/session";
import { listOrdersByUser } from "@/server/order";

/** 我的订单(V4.0.1):前台个人中心;按登录账号 userId 查询(游客单走邮件链接查询) */
export async function GET() {
  const user = await getUserSession();
  if (!user) return jsonErr("请先登录", 401);
  return jsonOk(await listOrdersByUser(user.id));
}
