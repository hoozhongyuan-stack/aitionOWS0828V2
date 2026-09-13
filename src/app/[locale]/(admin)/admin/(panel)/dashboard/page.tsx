"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet } from "@/components/admin/api-client";
import { TrendChart } from "@/components/admin/trend-chart";
import {
  PRESET_DAYS,
  presetRange,
  resolveCustomRange,
  dashboardRangeQuery,
  resolveTrendSeries,
  type DateRange,
  type RangePresetDays,
  type TrendPoint,
} from "./logic";
import { Eye, Users, FileText, MessageSquareWarning, Inbox, ClipboardList } from "lucide-react";

/**
 * 数据看板(需求 5):今日 PV/UV、业务总量、待办入口、访问趋势。
 * V3.1(REQ-006):趋势图支持时间段筛选——近 7/30/90 天预设 + 自定义起止
 * (`<input type="date">` + 应用);选中区间经 /api/admin/dashboard?from=&to= 拉取
 * 逐日序列(date 展示 YYYY-MM-DD,超宽横向滚动);默认近 7 天。
 */

interface Stats {
  today: { pv: number; uv: number };
  week: TrendPoint[];
  range?: { from: string; to: string; series: TrendPoint[] };
  totals: {
    contents: number;
    users: number;
    pendingComments: number;
    pendingSubmissions: number;
    forms: number;
    formSubmissions: number;
  };
}

const presetBtnClass = (active: boolean) =>
  active
    ? "rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
    : "rounded-md border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

const dateInputClass =
  "rounded-md border bg-background px-2 py-1.5 text-sm text-foreground";

export default function DashboardPage() {
  const locale = useLocale();
  const [stats, setStats] = useState<Stats | null>(null);
  // 默认近 7 天(REQ-006);range 变化即重新拉取
  const [range, setRange] = useState<DateRange>(() => presetRange(7));
  const [activePreset, setActivePreset] = useState<RangePresetDays | "custom">(7);
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");

  useEffect(() => {
    apiGet<Stats>(dashboardRangeQuery(range))
      .then(setStats)
      .catch((e) => toast.error(e.message));
  }, [range]);

  const applyPreset = (days: RangePresetDays) => {
    setActivePreset(days);
    setStats(null); // 切换区间时清空旧图,避免误读旧区间数据
    setRange(presetRange(days));
  };

  const applyCustom = () => {
    const next = resolveCustomRange(fromInput, toInput);
    if (!next) {
      toast.error("请选择有效的起止日期(结束不早于开始,跨度不超过 92 天)");
      return;
    }
    setActivePreset("custom");
    setStats(null);
    setRange(next);
  };

  if (!stats) return <div className="text-sm text-muted-foreground">加载中…</div>;

  const trend = resolveTrendSeries(stats);
  const pendingTotal = stats.totals.pendingComments + stats.totals.pendingSubmissions;

  const cards = [
    { icon: Eye, label: "今日访问(PV / UV)", value: `${stats.today.pv} / ${stats.today.uv}` },
    { icon: FileText, label: "已发布内容", value: stats.totals.contents, href: "/admin/content" },
    { icon: Users, label: "注册用户", value: stats.totals.users, href: "/admin/users" },
    {
      icon: ClipboardList,
      label: "表单 / 累计提交",
      value: `${stats.totals.forms} / ${stats.totals.formSubmissions}`,
      href: "/admin/forms",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">数据看板</h1>
        <p className="text-sm text-muted-foreground">站点访问与业务概览。</p>
      </div>

      {pendingTotal > 0 && (
        <Link
          href={`/${locale}/admin/ugc`}
          className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm hover:bg-destructive/10"
        >
          <MessageSquareWarning className="h-5 w-5 text-destructive" />
          <span>
            有 <b>{stats.totals.pendingComments}</b> 条评论、<b>{stats.totals.pendingSubmissions}</b> 条投稿待审核,点击处理
          </span>
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          const body = (
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="text-xl font-semibold">{c.value}</div>
                  <div className="text-xs text-muted-foreground">{c.label}</div>
                </div>
              </CardContent>
            </Card>
          );
          return c.href ? (
            <Link key={c.label} href={`/${locale}${c.href}`}>
              {body}
            </Link>
          ) : (
            <div key={c.label}>{body}</div>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>访问趋势({range.from} ~ {range.to})</CardTitle>
        </CardHeader>
        <CardContent>
          {/* 筛选档(REQ-006):预设 + 自定义起止;纯逻辑在 ./logic.ts(TEST-205) */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {PRESET_DAYS.map((days) => (
              <button
                key={days}
                type="button"
                className={presetBtnClass(activePreset === days)}
                aria-pressed={activePreset === days}
                onClick={() => applyPreset(days)}
              >
                近 {days} 天
              </button>
            ))}
            <input
              type="date"
              value={fromInput}
              onChange={(e) => setFromInput(e.target.value)}
              className={dateInputClass}
              aria-label="开始日期"
            />
            <span className="text-sm text-muted-foreground">至</span>
            <input
              type="date"
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
              className={dateInputClass}
              aria-label="结束日期"
            />
            <button
              type="button"
              className={presetBtnClass(activePreset === "custom")}
              aria-pressed={activePreset === "custom"}
              onClick={applyCustom}
            >
              应用
            </button>
          </div>

          {/* V4.6.4:SVG 面积折线图(刻度/网格/hover 浮层/禁选中) */}
          <TrendChart data={trend.map((d) => ({ date: d.date, pv: d.pv, uv: d.uv }))} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>快捷待办</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Link
            href={`/${locale}/admin/ugc`}
            className="flex items-center gap-2 rounded-lg border p-3 text-sm hover:bg-accent"
          >
            <MessageSquareWarning className="h-4 w-4" />
            评论待审核:{stats.totals.pendingComments}
          </Link>
          <Link
            href={`/${locale}/admin/ugc`}
            className="flex items-center gap-2 rounded-lg border p-3 text-sm hover:bg-accent"
          >
            <Inbox className="h-4 w-4" />
            投稿待审核:{stats.totals.pendingSubmissions}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
