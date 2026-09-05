"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet } from "@/components/admin/api-client";

/**
 * GEO 监测(V3.2):AI 爬虫趋势 / 被爬页面 Top / AI 渠道引荐。
 * 自控数据:AI 爬虫 UA 识别 + AI 渠道引荐记录(server/geo + layout 记录点)。
 */
interface TrendPoint {
  date: string;
  [engine: string]: string | number;
}
interface GeoStats {
  from: string;
  to: string;
  trend: TrendPoint[];
  topPages: { path: string; bot: string; count: number }[];
  referrals: { source: string; landing: string; date?: string; count: number; visitors: number }[];
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

const ENGINE_COLORS = ["#22d3ee", "#a78bfa", "#34d399", "#fbbf24", "#f87171", "#60a5fa"];

export default function GeoMonitorPage() {
  const [stats, setStats] = useState<GeoStats | null>(null);
  const [range, setRange] = useState(fmtRange(7));
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [error, setError] = useState("");

  useEffect(() => {
    load(range.from, range.to);
  }, [range.from, range.to]);

  async function load(from: string, to: string) {
    try {
      setError("");
      const d = await apiGet<GeoStats>(`/api/admin/geo-monitor?from=${from}&to=${to}`);
      setStats(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }

  const engines = stats
    ? [...new Set(stats.trend.flatMap((t) => Object.keys(t).filter((k) => k !== "date")))]
    : [];
  const maxVal = Math.max(1, ...(stats?.trend.flatMap((t) => Object.values(t).filter((v) => typeof v === "number")) ?? [1]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">GEO 监测</h1>
        <p className="text-sm text-muted-foreground">
          AI 爬虫抓取与 AI 渠道引荐的自控数据监测——可见、可监控、说得上来渠道与时间。
        </p>
      </div>

      {/* 时间筛选 */}
      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <Button
            key={r.days}
            size="sm"
            variant={range.to === fmtRange(r.days).to && range.from === fmtRange(r.days).from ? "default" : "outline"}
            onClick={() => setRange(fmtRange(r.days))}
          >
            {r.label}
          </Button>
        ))}
        <span className="ml-2 text-sm text-muted-foreground">自定义:</span>
        <input
          type="date"
          className="rounded-md border bg-background px-2 py-1 text-sm"
          value={custom.from}
          onChange={(e) => setCustom({ ...custom, from: e.target.value })}
        />
        <span className="text-muted-foreground">至</span>
        <input
          type="date"
          className="rounded-md border bg-background px-2 py-1 text-sm"
          value={custom.to}
          onChange={(e) => setCustom({ ...custom, to: e.target.value })}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (!custom.from || !custom.to) return setError("请选择起止日期");
            if (custom.from > custom.to) return setError("开始日期不能晚于结束日期");
            const days = (Date.parse(custom.to) - Date.parse(custom.from)) / 86_400_000;
            if (days > 92) return setError("区间跨度不能超过 92 天");
            setRange({ from: custom.from, to: custom.to });
          }}
        >
          应用
        </Button>
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>

      {stats && (
        <>
          {/* AI 爬虫趋势 */}
          <Card>
            <CardHeader>
              <CardTitle>AI 爬虫趋势({stats.from} ~ {stats.to})</CardTitle>
              <CardDescription>各 AI 引擎对站点的抓取次数(按天)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-3 overflow-x-auto pb-2">
                {stats.trend.map((t) => (
                  <div key={t.date} className="flex min-w-[64px] flex-1 flex-col items-center gap-1">
                    <div className="flex h-32 w-full items-end justify-center gap-0.5">
                      {engines.map((engine, i) => {
                        const v = Number(t[engine] ?? 0);
                        return (
                          <div
                            key={engine}
                            title={`${engine}: ${v}`}
                            className="w-3 rounded-t"
                            style={{
                              height: `${Math.max(4, (v / maxVal) * 100)}%`,
                              background: ENGINE_COLORS[i % ENGINE_COLORS.length],
                            }}
                          />
                        );
                      })}
                    </div>
                    <span className="text-[10px] text-muted-foreground">{t.date.slice(5)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                {engines.map((e, i) => (
                  <span key={e} className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ background: ENGINE_COLORS[i % ENGINE_COLORS.length] }} />
                    {e}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 被爬页面 Top 10 */}
          <Card>
            <CardHeader>
              <CardTitle>被爬页面 Top 10</CardTitle>
              <CardDescription>哪些内容最受 AI 引擎关注(按抓取次数)</CardDescription>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2">路径</th>
                    <th className="py-2">AI 引擎</th>
                    <th className="py-2 text-right">抓取次数</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.topPages.map((p, i) => (
                    <tr key={`${p.path}-${p.bot}-${i}`} className="border-b">
                      <td className="py-2 font-medium">{p.path}</td>
                      <td className="py-2 text-muted-foreground">{p.bot}</td>
                      <td className="py-2 text-right">{p.count}</td>
                    </tr>
                  ))}
                  {stats.topPages.length === 0 && (
                    <tr><td colSpan={3} className="py-4 text-center text-muted-foreground">暂无抓取记录</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* AI 渠道引荐 */}
          <Card>
            <CardHeader>
              <CardTitle>AI 渠道引荐</CardTitle>
              <CardDescription>
                从 AI 引擎点击链接来到站点的访客(渠道 × 落地页)——「被引用后带来流量」的直接证据
              </CardDescription>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2">AI 渠道</th>
                    <th className="py-2">落地页</th>
                    <th className="py-2 text-right">点击次数</th>
                    <th className="py-2 text-right">访客数</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.referrals.map((r, i) => (
                    <tr key={`${r.source}-${r.landing}-${i}`} className="border-b">
                      <td className="py-2 font-medium">{r.source}</td>
                      <td className="py-2 text-muted-foreground">{r.landing}</td>
                      <td className="py-2 text-right">{r.count}</td>
                      <td className="py-2 text-right">{r.visitors}</td>
                    </tr>
                  ))}
                  {stats.referrals.length === 0 && (
                    <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">暂无 AI 渠道引荐记录</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            说明:数据为站点自控统计(AI 爬虫 UA 识别 + AI 渠道引荐记录),可精确到渠道与时间;
            「被 AI 回答引用」的主动探测属二期规划。相关配置:llms.txt(/llms.txt)与 robots.txt 已就绪。
          </p>
        </>
      )}

      <div className="text-xs text-muted-foreground">
        <Link href="/zh-CN/admin/dashboard" className="underline">返回数据看板</Link>
      </div>
    </div>
  );
}
