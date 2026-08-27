import { z } from "zod";
import { jsonOk, parseBody, getClientIp } from "@/lib/api";
import { increaseView } from "@/server/ugc";
import { rateLimit } from "@/lib/ugc/anti-spam";

/**
 * 阅读量上报:POST /api/interaction/view { contentId }
 * 防刷:同 IP 对同一内容 1 小时内只计 1 次。
 */
const schema = z.object({ contentId: z.number().int() });

export async function POST(req: Request) {
  const parsed = await parseBody(req, schema);
  if (parsed.error) return parsed.error;
  const ip = getClientIp(req);
  if (rateLimit(`view:${ip}:${parsed.data.contentId}`, 1, 3600_000)) {
    await increaseView(parsed.data.contentId);
  }
  return jsonOk(); // 防刷命中也返回 ok,不给刷子信号
}
