import { z } from "zod";
import { jsonOk, parseBody, getClientIp } from "@/lib/api";
import { trackPageView } from "@/server/analytics";
import {
  matchReferral,
  matchSearchReferral,
  recordReferral,
  recordUnknownReferral,
  refererHostname,
} from "@/server/geo";
import { rateLimit } from "@/lib/ugc/anti-spam";

/**
 * 访问统计上报:POST /api/track { path, visitorId, referrer? }
 *
 * - PV/UV:全站匿名统计(visitorId 本地持久化,不含个人信息)
 * - 引荐(V4.8.2 起):AI 引擎 / 传统搜索 / 未识别来源的识别在**这里**做 ——
 *   只有浏览器能同时提供初始来源(document.referrer)与匿名访客标识,
 *   而 GEO 的独立访客必须按人去重(见 server/geo 的 recordReferral)。
 *   爬虫不执行 JS,其识别仍在 [locale]/layout(服务端)完成。
 */
const schema = z.object({
  path: z.string().min(1).max(300),
  visitorId: z.string().min(8).max(64),
  /** 初始来源页(document.referrer);每次页面加载只由客户端上报一次 */
  referrer: z.string().max(2048).optional(),
});

export async function POST(req: Request) {
  const parsed = await parseBody(req, schema);
  if (parsed.error) return jsonOk(); // 埋点静默失败
  const ip = getClientIp(req);
  if (!rateLimit(`track:${ip}`, 60, 60_000)) return jsonOk();

  const { path, visitorId, referrer } = parsed.data;
  // 后台路径既不计入站点统计,也不做引荐记录
  if (/^\/(zh-CN|en)?\/?admin/.test(path)) return jsonOk();

  await trackPageView(path, visitorId).catch(() => {});

  if (referrer) {
    const hostOnly = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();
    const refHost = refererHostname(referrer);
    const ai = matchReferral(referrer);
    const search = ai ? null : matchSearchReferral(referrer);
    try {
      if (ai) {
        await recordReferral(ai, path, "ai", visitorId);
      } else if (search) {
        await recordReferral(search, path, "search", visitorId);
      } else if (refHost && refHost !== hostOnly) {
        // 未识别来源(V4.7.2 口径):非本站、未命中白名单时只记主机名,
        // 用于查清"某家 AI 为什么没有引荐记录"(带了但没收录 vs 压根没带 Referer)
        await recordUnknownReferral(refHost, path);
      }
    } catch {
      // 引荐记录失败不影响埋点语义
    }
  }

  return jsonOk();
}
