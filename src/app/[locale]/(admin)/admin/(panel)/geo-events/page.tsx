"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiGet } from "@/components/admin/api-client";
import { TablePagination } from "@/components/admin/table-pagination";

/**
 * 访问明细(V4.1.1 独立页):AI 爬虫/渠道引荐逐条记录,时间/引擎/路径筛选+分页+CSV 导出。
 * 数据源同 /api/admin/geo-monitor type=events;保留 180 天。
 */
interface EventRow {
  id: number;
  bot?: string;
  path?: string;
  source?: string;
  landing?: string;
  ua?: string | null;
  ts: string;
}

const RANGES = [
  { label: "近 7 天", days: 7 },
  { label: "近 30 天", days: 30 },
  { label: "近 90 天", days: 90 },
];

function fmtRange(days: number) {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86_400_000);
  const f = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: f(from), to: f(to) };
}

export default function GeoEventsPage() {
  // V4.6.4 五类口径:AI 爬虫 / 搜索引擎 / 疑似抓取 / AI 引荐 / 搜索引荐
  type TabKey = "ai-crawl" | "search-crawl" | "suspected-crawl" | "ai-referral" | "search-referral";
  const [tab, setTab] = useState<TabKey>("ai-crawl");
  const eventType: "crawl" | "referral" = tab.endsWith("referral") ? "referral" : "crawl";
  const kind: "ai" | "search" | "suspected" =
    tab.startsWith("search") ? "search" : tab.startsWith("suspected") ? "suspected" : "ai";
  const [range, setRange] = useState(fmtRange(7));
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [bot, setBot] = useState("");
  const [pathLike, setPathLike] = useState("");
  const [data, setData] = useState<{ total: number; page: number; pageSize: number; items: EventRow[] } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [knownBots, setKnownBots] = useState<string[]>([]);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({
      type: "events",
      eventType,
      kind,
      from: range.from,
      to: range.to,
      page: String(page),
      pageSize: String(pageSize),
    });
    if (eventType === "crawl" && bot) qs.set("bot", bot);
    if (pathLike) qs.set("pathLike", pathLike);
    try {
      const d = await apiGet<{ total: number; page: number; pageSize: number; items: EventRow[] }>(
        `/api/admin/geo-monitor?${qs.toString()}`
      );
      setData(d);
    } catch {
      toast.error("明细加载失败");
    }
  }, [eventType, kind, range, page, pageSize, bot, pathLike]);
  useEffect(() => {
    void load();
  }, [load]);

  // 引擎下拉选项(白名单常量经 stats 接口带出;缓存一次)
  useEffect(() => {
    const qs = new URLSearchParams({ from: range.from, to: range.to, kind });
    apiGet<{ knownBots?: string[] }>(`/api/admin/geo-monitor?${qs}`)
      .then((d) => setKnownBots(d.knownBots ?? []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  function exportCsv() {
    const items = data?.items ?? [];
    if (!items.length) {
      toast.error("当前无明细数据");
      return;
    }
    const rows = items.map((i) =>
      eventType === "crawl"
        ? { kind, ts: i.ts, bot: i.bot ?? "", path: i.path ?? "", ua: i.ua ?? "" }
        : { kind, ts: i.ts, source: i.source ?? "", landing: i.landing ?? "" }
    );
    const head = Object.keys(rows[0]).join(",");
    const csv =
      head + "\n" + rows.map((r) => Object.values(r).map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `geo-${tab}-${range.from}_${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">访问明细</h1>
          <p className="text-sm text-muted-foreground">
            AI 爬虫与渠道引荐的逐条记录(秒级),保留 180 天;<Link href="/zh-CN/admin/geo-monitor" className="underline hover:text-primary">返回 GEO 监测</Link>
          </p>
        </div>
      </div>

      {/* 类型 Tab + 时间 + 筛选 */}
      {tab === "suspected-crawl" && (
        <p className="rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          ⚠️ 推测口径:通用客户端 UA + 无 Cookie + 无站内来源的抓取;无法归因具体产品,可能含 RSS/监控/脚本噪声,请勿作为正式指标。
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["ai-crawl", "AI 爬虫"],
            ["search-crawl", "搜索引擎"],
            ["suspected-crawl", "疑似抓取"],
            ["ai-referral", "AI 引荐"],
            ["search-referral", "搜索引荐"],
          ] as [TabKey, string][]
        ).map(([k, label]) => (
          <Button
            key={k}
            size="sm"
            variant={tab === k ? "default" : "outline"}
            onClick={() => {
              setTab(k);
              setBot("");
              setPage(1);
            }}
          >
            {label}
          </Button>
        ))}
        <span className="ml-2 text-sm text-muted-foreground">时间:</span>
        {RANGES.map((r) => (
          <Button
            key={r.days}
            size="sm"
            variant={range.from === fmtRange(r.days).from && range.to === fmtRange(r.days).to ? "default" : "outline"}
            onClick={() => {
              setRange(fmtRange(r.days));
              setPage(1);
            }}
          >
            {r.label}
          </Button>
        ))}
        <Input
          type="date"
          className="w-36"
          value={custom.from}
          onChange={(e) => setCustom({ ...custom, from: e.target.value })}
        />
        <span className="text-muted-foreground">至</span>
        <Input
          type="date"
          className="w-36"
          value={custom.to}
          onChange={(e) => setCustom({ ...custom, to: e.target.value })}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (!custom.from || !custom.to) {
              toast.error("请选择起止日期");
              return;
            }
            if (custom.from > custom.to) {
              toast.error("开始日期不能晚于结束日期");
              return;
            }
            setRange({ from: custom.from, to: custom.to });
            setPage(1);
          }}
        >
          应用
        </Button>
        {eventType === "crawl" && (
          <select
            className="rounded-md border bg-background px-2 py-1.5 text-sm"
            value={bot}
            onChange={(e) => {
              setBot(e.target.value);
              setPage(1);
            }}
          >
            <option value="">全部引擎</option>
            {knownBots.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        )}
        <Input
          className="w-48"
          placeholder={eventType === "referral" ? "落地页关键字…" : "路径关键字…"}
          value={pathLike}
          onChange={(e) => setPathLike(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setPage(1)}
        />
        <Button size="sm" variant="outline" onClick={() => setPage(1)}>
          查询
        </Button>
        <Button size="sm" variant="outline" onClick={exportCsv}>
          导出 CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {tab === "ai-crawl"
              ? "AI 爬虫明细"
              : tab === "search-crawl"
                ? "传统搜索引擎明细"
                : tab === "suspected-crawl"
                  ? "疑似 AI 抓取明细(推测口径)"
                  : tab === "ai-referral"
                    ? "AI 渠道引荐明细"
                    : "搜索引擎引荐明细"}
          </CardTitle>
          <CardDescription>共 {data?.total ?? "…"} 条</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2">时间</th>
                <th className="py-2">{eventType === "crawl" ? "AI 引擎" : "AI 渠道"}</th>
                <th className="py-2">{eventType === "crawl" ? "路径" : "落地页"}</th>
                {eventType === "crawl" && <th className="py-2">UA</th>}
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((i) => (
                <tr key={i.id} className="border-b">
                  <td className="whitespace-nowrap py-2 text-muted-foreground">{new Date(i.ts).toLocaleString()}</td>
                  <td className="py-2">{eventType === "crawl" ? i.bot : i.source}</td>
                  <td className="max-w-72 truncate py-2" title={eventType === "crawl" ? i.path : i.landing}>
                    {eventType === "crawl" ? i.path : i.landing}
                  </td>
                  {eventType === "crawl" && (
                    <td className="max-w-56 truncate py-2 text-muted-foreground" title={i.ua ?? ""}>
                      {i.ua ?? ""}
                    </td>
                  )}
                </tr>
              ))}
              {(data?.items?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground">
                    暂无明细
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="mt-4">
            <TablePagination
              total={data?.total ?? 0}
              page={page}
              pageSize={pageSize}
              onPage={(p) => setPage(p)}
              onPageSize={(n) => {
                setPageSize(n);
                setPage(1);
              }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
