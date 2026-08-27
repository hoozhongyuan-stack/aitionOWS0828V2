import { z } from "zod";
import { jsonOk, jsonErr, parseBody, getClientIp } from "@/lib/api";
import { getFeatureFlags } from "@/lib/config";
import { recordShare } from "@/server/ugc";
import { rateLimit } from "@/lib/ugc/anti-spam";

/**
 * 转发计数:POST /api/interaction/share { contentId }
 * 客户端复制链接成功后上报;IP 限频防刷。
 */
const schema = z.object({ contentId: z.number().int() });

export async function POST(req: Request) {
  const features = await getFeatureFlags();
  if (!features.share) return jsonErr("转发功能未开启", 403);

  const parsed = await parseBody(req, schema);
  if (parsed.error) return parsed.error;

  const ip = getClientIp(req);
  if (!rateLimit(`share:${ip}:${parsed.data.contentId}`, 5, 60_000)) {
    return jsonOk({ shareCount: null }); // 限频命中静默处理
  }
  const shareCount = await recordShare(parsed.data.contentId, ip);
  return jsonOk({ shareCount });
}
