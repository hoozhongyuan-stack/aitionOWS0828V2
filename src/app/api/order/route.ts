import { z } from "zod";
import { jsonErr, jsonOk, parseBody } from "@/lib/api";
import { createOrder, getOrderByNoAndEmail } from "@/server/order";
import { getShopConfig } from "@/server/shop";

/**
 * 公开订单接口(V4.0 交易 MVP):
 * - POST 创建订单(游客可下单;服务端按现价重算金额并快照,前端仅传 contentId+qty)
 * - GET  买家查询(邮箱+订单号双因子,只读)
 */

const createSchema = z.object({
  lines: z
    .array(z.object({ contentId: z.number().int().positive(), qty: z.number().int().min(1).max(99) }))
    .min(1)
    .max(50),
  email: z.string().max(120),
  name: z.string().min(1).max(80),
  phone: z.string().max(40).optional(),
  country: z.string().min(1).max(80),
  address: z.string().min(1).max(200),
  city: z.string().min(1).max(80),
  zip: z.string().max(20).optional(),
  note: z.string().max(500).optional(),
  locale: z.string().max(10).optional(),
});

export async function POST(req: Request) {
  const parsed = await parseBody(req, createSchema);
  if (parsed.error) return parsed.error;
  const d = parsed.data;
  try {
    const order = await createOrder({
      lines: d.lines,
      email: d.email,
      name: d.name,
      phone: d.phone,
      country: d.country,
      address: d.address,
      city: d.city,
      zip: d.zip,
      note: d.note,
      locale: d.locale ?? "en",
    });
    const shop = await getShopConfig();
    return jsonOk({ ...order, paymentInfo: shop.paymentInfo });
  } catch (e) {
    return jsonErr(e instanceof Error ? e.message : "下单失败");
  }
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const no = sp.get("no")?.trim();
  const email = sp.get("email")?.trim();
  if (!no || !email) return jsonErr("请提供订单号与下单邮箱");
  const order = await getOrderByNoAndEmail(no, email);
  if (!order) return jsonErr("订单不存在或邮箱不匹配", 404);
  return jsonOk(order);
}
