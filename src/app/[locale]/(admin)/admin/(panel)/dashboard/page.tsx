"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet } from "@/components/admin/api-client";
import { Eye, Users, FileText, MessageSquareWarning, Inbox, ClipboardList } from "lucide-react";

/** 数据看板(需求 5):今日 PV/UV、7 天趋势、业务总量、待办入口 */

interface Stats {
  today: { pv: number; uv: number };
  week: { date: string; pv: number; uv: number }[];
  totals: {
    contents: number;
    users: number;
    pendingComments: number;
    pendingSubmissions: number;
    forms: number;
    formSubmissions: number;
  };
}

export default function DashboardPage() {
  const locale = useLocale();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    apiGet<Stats>("/api/admin/dashboard")
      .then(setStats)
      .catch((e) => toast.error(e.message));
  }, []);

  if (!stats) return <div className="text-sm text-muted-foreground">加载中…</div>;

  const maxPv = Math.max(1, ...stats.week.map((d) => d.pv));
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
    <div className="max-w-5xl space-y-6">
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
          <CardTitle>近 7 天访问趋势</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-40 items-end gap-2">
            {stats.week.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs text-muted-foreground">{d.pv}</span>
                <div
                  className="w-full rounded-t bg-primary/80 transition-all"
                  style={{ height: `${Math.max(4, (d.pv / maxPv) * 110)}px` }}
                  title={`${d.date}:PV ${d.pv} / UV ${d.uv}`}
                />
                <span className="text-[10px] text-muted-foreground">{d.date}</span>
              </div>
            ))}
          </div>
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
