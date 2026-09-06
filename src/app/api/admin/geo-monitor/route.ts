import { jsonErr, jsonOk } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { getGeoMonitorStats, listCrawlEvents, listReferralEvents } from "@/server/geo";

/**
 * GEO 监测数据:GET /api/admin/geo-monitor?from=YYYY-MM-DD&to=YYYY-MM-DD
 * 可选 from/to(ISO 日期,成对,from<=to,跨度<=92);缺省近 7 天。
 * 返回 { from, to, trend(按引擎逐日), topPages(被爬 Top10), referrals(引荐 Top10) }
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SPAN_DAYS = 92;

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;

  const sp = new URL(req.url).searchParams;

  // 明细查询(V3.2.1):type=events 时返回爬虫/引荐事件明细分页
  if (sp.get("type") === "events") {
    const f = {
      bot: sp.get("bot") ?? undefined,
      source: sp.get("source") ?? undefined,
      pathLike: sp.get("pathLike") ?? undefined,
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
      page: Number(sp.get("page")) || 1,
      pageSize: Math.min(500, Number(sp.get("pageSize")) || 100),
    };
    const type = sp.get("eventType") === "referral" ? "referral" : "crawl";
    const result =
      type === "referral" ? await listReferralEvents(f) : await listCrawlEvents(f);
    return jsonOk(result);
  }

  const from = sp.get("from");
  const to = sp.get("to");

  let range: { from: string; to: string };
  if (!from && !to) {
    const now = new Date();
    const start = new Date(now.getTime() - 6 * 86_400_000);
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    range = { from: fmt(start), to: fmt(now) };
  } else if (from && to) {
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) return jsonErr("日期格式非法,应为 YYYY-MM-DD", 400);
    const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
    if (days < 0) return jsonErr("from 不能晚于 to", 400);
    if (days > MAX_SPAN_DAYS) return jsonErr(`区间跨度不能超过 ${MAX_SPAN_DAYS} 天`, 400);
    range = { from, to };
  } else {
    return jsonErr("from/to 必须成对出现", 400);
  }

  return jsonOk(await getGeoMonitorStats(range.from, range.to));
}
