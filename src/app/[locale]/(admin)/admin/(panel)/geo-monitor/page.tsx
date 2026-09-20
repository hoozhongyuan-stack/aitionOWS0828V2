"use client";

import { useCallback, useEffect, useState } from "react";
import { AI_CRAWLERS } from "@/lib/seo/ai-crawlers";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet } from "@/components/admin/api-client";

/**
 * GEO 监测(V3.2;V4.6.4 口径分区):
 * 三块并列——① AI 引擎抓取(GEO 正式口径) ② 传统搜索引擎抓取(与 AI 隔离)
 * ③ 疑似 AI 抓取(启发式推测,独立只读区块,不进正式指标)。
 * 数据源 /api/admin/geo-monitor?kind=ai|search|suspected。
 */

interface TrendPoint {
  date: string;
  [engine: string]: string | number;
}
interface GeoStats {
  from: string;
  to: string;
  kind?: string;
  trend: TrendPoint[];
  topPages: { path: string; bot: string; count: number }[];
  referrals: { source: string; landing: string; count: number; visitors: number }[];
  knownBots?: string[];
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

/** 单块统计卡(趋势 + Top 页面),三口径复用 */
function StatsBlock({
  title,
  desc,
  stats,
  accent,
  extra,
}: {
  title: string;
  desc: string;
  stats: GeoStats | null;
  accent?: string;
  extra?: React.ReactNode;
}) {
  const engines = stats
    ? [...new Set(stats.trend.flatMap((t) => Object.keys(t).filter((k) => k !== "date")))]
    : [];
  const maxVal = Math.max(
    1,
    ...(stats?.trend.flatMap((t) => Object.values(t).filter((v) => typeof v === "number")) ?? [1])
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {accent && <span className="h-2.5 w-2.5 rounded-full" style={{ background: accent }} />}
          {title}
        </CardTitle>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {extra}
        {!stats || stats.trend.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            该区间暂无记录
          </p>
        ) : (
          <>
            <div className="flex items-end gap-3 overflow-x-auto pb-2">
              {stats.trend.map((t) => (
                <div key={t.date} className="flex min-w-[56px] flex-1 flex-col items-center gap-1">
                  <div className="flex h-24 w-full items-end justify-center gap-0.5">
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
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {engines.map((e, i) => (
                <span key={e} className="inline-flex items-center gap-1">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: ENGINE_COLORS[i % ENGINE_COLORS.length] }}
                  />
                  {e}
                </span>
              ))}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2">路径</th>
                  <th className="py-2">来源</th>
                  <th className="py-2 text-right tabular-nums">次数</th>
                </tr>
              </thead>
              <tbody>
                {stats.topPages.map((p, i) => (
                  <tr key={`${p.path}-${p.bot}-${i}`} className="border-b">
                    <td className="max-w-72 truncate py-2 font-medium" title={p.path}>
                      {p.path}
                    </td>
                    <td className="max-w-56 truncate py-2 text-muted-foreground" title={p.bot}>
                      {p.bot}
                    </td>
                    <td className="py-2 text-right tabular-nums">{p.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function GeoMonitorPage() {
  const [range, setRange] = useState(fmtRange(7));
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [error, setError] = useState("");
  const [ai, setAi] = useState<GeoStats | null>(null);
  const [search, setSearch] = useState<GeoStats | null>(null);
  const [suspected, setSuspected] = useState<GeoStats | null>(null);
  // V4.7.2:未识别来源(Referer 存在但未命中白名单,只记主机名)——诊断"某家 AI 为何无记录"
  const [unknown, setUnknown] = useState<GeoStats | null>(null);

  const load = useCallback(async () => {
    setError("");
    const qs = (kind: string) => `from=${range.from}&to=${range.to}&kind=${kind}`;
    try {
      const [a, s, u, unk] = await Promise.all([
        apiGet<GeoStats>(`/api/admin/geo-monitor?${qs("ai")}`),
        apiGet<GeoStats>(`/api/admin/geo-monitor?${qs("search")}`),
        apiGet<GeoStats>(`/api/admin/geo-monitor?${qs("suspected")}`),
        apiGet<GeoStats>(`/api/admin/geo-monitor?${qs("unknown")}`),
      ]);
      setAi(a);
      setSearch(s);
      setSuspected(u);
      setUnknown(unk);
    } catch {
      setError("加载失败");
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  const sum = (st: GeoStats | null) => (st?.topPages ?? []).reduce((n, p) => n + p.count, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">GEO 监测</h1>
        <p className="text-sm text-muted-foreground">
          三块口径互相隔离:AI 引擎抓取(GEO 正式指标)/ 传统搜索引擎抓取(不计入 AI 可见性)/
          疑似 AI 抓取(启发式推测,仅供参考)
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
        <Button size="sm" variant="ghost" asChild>
          <Link href="/zh-CN/admin/geo-events">查看访问明细 →</Link>
        </Button>
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>

      {/* ① AI 引擎(正式口径) */}
      <StatsBlock
        title="AI 引擎抓取"
        accent="#8e1c2e"
        desc={`GEO 正式指标:各 AI 引擎对本站的抓取次数(按天);白名单覆盖国内外 ${AI_CRAWLERS.length} 个引擎`}
        stats={ai}
        extra={
          <p className="text-xs text-muted-foreground">
            区间合计抓取 <span className="font-medium text-foreground">{sum(ai)}</span> 次
          </p>
        }
      />

      {/* ② 传统搜索引擎(与 AI 隔离) */}
      <StatsBlock
        title="传统搜索引擎抓取"
        accent="#2563eb"
        desc="百度/搜狗/360/神马/Bing 等传统搜索爬虫;与 AI 口径分开统计。注:百度 AI 与百度搜索复用同一爬虫 UA,无法区分"
        stats={search}
        extra={
          <p className="text-xs text-muted-foreground">
            区间合计抓取 <span className="font-medium text-foreground">{sum(search)}</span> 次
            ——<span className="font-medium">不计入</span> AI 可见性指标
          </p>
        }
      />

      {/* ③ 疑似 AI 抓取(推测,独立只读) */}
      <StatsBlock
        title="疑似 AI 抓取(推测)"
        accent="#ea580c"
        desc="启发式推测:通用 HTTP 客户端 UA + 无 Cookie + 无站内来源;多来自 AI 开发/办公工具的按需抓取"
        stats={suspected}
        extra={
          <div className="space-y-2 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            <p className="font-medium">⚠️ 此块为推测口径,请勿作为正式指标</p>
            <ul className="list-inside list-disc space-y-1">
              <li>无法归因到具体产品(只能说明「有非人类抓取」):WorkBuddy/Trae/ZCode 等工具 UA 无公开标识</li>
              <li>会误收 RSS 阅读器、SEO 工具、可用性监控、自建脚本</li>
              <li>采样上限 200 条/天(超出只累加计数,不存明细)</li>
              <li>已知限制:中间件不经过静态资源,「同 IP 不取静态资源」这一信号无法观测</li>
            </ul>
            {(suspected?.topPages?.length ?? 0) > 0 && (
              <div className="pt-1">
                <p className="font-medium">UA 原文样本(供人工判断)</p>
                <ul className="space-y-0.5">
                  {[...new Set(suspected!.topPages.map((p) => p.bot))].slice(0, 8).map((b) => (
                    <li key={b} className="font-mono text-[11px] break-all">
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        }
      />

      {/* AI 渠道引荐(正式)+ 搜索引擎引荐(隔离) */}
      <Card>
        <CardHeader>
          <CardTitle>AI 渠道引荐</CardTitle>
          <CardDescription>
            从 AI 渠道点击链接来到站点的独立访客(渠道 × 落地页)——「被引用后带来流量」的直接证据。
            独立访客按「渠道 + 日期 + 匿名访客标识」去重:同一人当天从同一渠道来多次只计 1,跨天重新计
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* V4.7.2:AI 与搜索引擎两个口径合并到**同一张表** —— 此前两张表各自计算列宽,
              点击/访客列上下错位;合并后列宽天然一致,用一行小标题分隔两个口径。
              数字列统一 tabular-nums(等宽),纵向才能对齐 */}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2">渠道</th>
                <th className="w-[38%] py-2">落地页</th>
                <th className="py-2 text-right tabular-nums">点击</th>
                <th
                  className="py-2 text-right tabular-nums"
                  title="按 渠道 + 日期 + 匿名访客标识(aition_vid)去重;同一人当天从同一渠道多次到访只计 1"
                >
                  独立访客
                </th>
              </tr>
            </thead>
            <tbody>
              {(ai?.referrals ?? []).map((r, i) => (
                <tr key={`${r.source}-${r.landing}-${i}`} className="border-b">
                  <td className="py-2 font-medium">{r.source}</td>
                  <td className="max-w-72 truncate py-2 text-muted-foreground" title={r.landing}>
                    {r.landing}
                  </td>
                  <td className="py-2 text-right tabular-nums">{r.count}</td>
                  <td className="py-2 text-right tabular-nums">{r.visitors}</td>
                </tr>
              ))}
              {(ai?.referrals?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted-foreground">
                    暂无 AI 渠道引荐记录
                  </td>
                </tr>
              )}
          {(unknown?.referrals?.length ?? 0) > 0 && (
            <>
              <tr className="border-b bg-muted/40">
                <td colSpan={4} className="py-1.5 text-xs font-medium text-muted-foreground">
                  未识别来源 Top5(仅供参考,<strong>不等于 AI 渠道</strong>:Referer 存在但未命中白名单)
                </td>
              </tr>
              {unknown!.referrals.slice(0, 5).map((r, i) => (
                <tr key={`unknown-${r.source}-${i}`} className="border-b">
                  <td className="py-2 font-medium">{r.source}</td>
                  <td className="max-w-72 truncate py-2 text-muted-foreground" title={r.landing}>
                    {r.landing}
                  </td>
                  <td className="py-2 text-right tabular-nums">{r.count}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">{r.visitors}</td>
                </tr>
              ))}
            </>
          )}
          {(search?.referrals?.length ?? 0) > 0 && (
            <>
              <tr className="border-b bg-muted/40">
                <td colSpan={4} className="py-1.5 text-xs font-medium text-muted-foreground">
                  搜索引擎引荐(单独口径,不计入 AI)
                </td>
              </tr>
              {search!.referrals.map((r, i) => (
                <tr key={`${r.source}-${r.landing}-${i}`} className="border-b">
                  <td className="py-2 font-medium">{r.source}</td>
                  <td className="max-w-72 truncate py-2 text-muted-foreground" title={r.landing}>
                    {r.landing}
                  </td>
                  <td className="py-2 text-right tabular-nums">{r.count}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">{r.visitors}</td>
                </tr>
              ))}
            </>
          )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        说明:数据为站点自控统计(AI/搜索爬虫 UA 识别 + 渠道引荐记录 + 疑似抓取启发式),可精确到渠道与时间;
        「被 AI 回答引用」的主动探测属二期规划。相关配置:llms.txt(/llms.txt)与 robots.txt 已就绪。
      </p>

      <div className="text-xs text-muted-foreground">
        <Link href="/zh-CN/admin/dashboard" className="underline">
          返回数据看板
        </Link>
      </div>
    </div>
  );
}
