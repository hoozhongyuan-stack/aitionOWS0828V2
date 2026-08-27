import { z } from "zod";
import { jsonOk, parseBody, getClientIp } from "@/lib/api";
import { trackPageView } from "@/server/analytics";
import { rateLimit } from "@/lib/ugc/anti-spam";

/** 访问统计上报:POST /api/track { path, visitorId }(前台布局挂载埋点) */
const schema = z.object({
  path: z.string().min(1).max(300),
  visitorId: z.string().min(8).max(64),
});

export async function POST(req: Request) {
  const parsed = await parseBody(req, schema);
  if (parsed.error) return jsonOk(); // 埋点静默失败
  const ip = getClientIp(req);
  if (!rateLimit(`track:${ip}`, 60, 60_000)) return jsonOk();
  // 后台路径不计入站点统计
  if (!/^\/(zh-CN|en)?\/?admin/.test(parsed.data.path)) {
    await trackPageView(parsed.data.path, parsed.data.visitorId).catch(() => {});
  }
  return jsonOk();
}
