"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiGet } from "@/components/admin/api-client";
import { TablePagination } from "@/components/admin/table-pagination";
import { Badge } from "@/components/ui/badge";

/**
 * 操作日志(V4.1,主账号专属):敏感写操作审计;按管理员/动作/日期筛选,每页 10|50|100。
 */
interface LogRow {
  id: number;
  adminId: number | null;
  adminName: string;
  action: string;
  target: string | null;
  detail: string | null;
  ip: string | null;
  createdAt: string;
}

const ACTION_LABELS: [string, string][] = [
  ["auth.", "登录/账号"],
  ["content.", "内容"],
  ["categories.", "栏目"],
  ["nav.", "导航"],
  ["banners.", "轮播图"],
  ["media.", "文件"],
  ["forms.", "表单"],
  ["orders.", "订单"],
  ["settings.", "设置"],
  ["agreements.", "协议"],
  ["locales.", "语言"],
  ["seo.", "SEO"],
  ["users.", "用户"],
  ["admin-users.", "子账号"],
  ["backup.", "备份"],
  ["ugc.", "审核"],
];

export default function AdminLogsPage() {
  const [data, setData] = useState<{ total: number; page: number; pageSize: number; items: LogRow[] } | null>(null);
  const [adminId, setAdminId] = useState("");
  const [actionPrefix, setActionPrefix] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const load = useCallback(() => {
    const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (adminId) q.set("adminId", adminId);
    if (actionPrefix) q.set("actionPrefix", actionPrefix);
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    apiGet<{ total: number; page: number; pageSize: number; items: LogRow[] }>(`/api/admin/admin-logs?${q}`)
      .then(setData)
      .catch(() => toast.error("日志加载失败"));
  }, [adminId, actionPrefix, from, to, page, pageSize]);
  useEffect(load, [load]);

  function labelOf(action: string) {
    const hit = ACTION_LABELS.find(([p]) => action.startsWith(p));
    return hit ? hit[1] : "其他";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">操作日志</h1>
        <p className="text-sm text-muted-foreground">
          后台敏感操作审计(登录/配置/内容/订单等写操作);只增不改,保留追溯
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-36"
          placeholder="管理员 ID"
          value={adminId}
          onChange={(e) => {
            setAdminId(e.target.value);
            setPage(1);
          }}
        />
        <select
          className="rounded-md border bg-background px-2 py-1 text-sm"
          value={actionPrefix}
          onChange={(e) => {
            setActionPrefix(e.target.value);
            setPage(1);
          }}
        >
          <option value="">全部动作</option>
          {ACTION_LABELS.map(([p, l]) => (
            <option key={p} value={p}>
              {l}
            </option>
          ))}
        </select>
        <Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="text-muted-foreground">至</span>
        <Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        <button
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
          onClick={() => setPage(1)}
        >
          查询
        </button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>日志列表</CardTitle>
          <CardDescription>共 {data?.total ?? "…"} 条</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2">时间</th>
                <th className="py-2">操作人</th>
                <th className="py-2">动作</th>
                <th className="py-2">对象</th>
                <th className="py-2">详情</th>
                <th className="py-2">IP</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((l) => (
                <tr key={l.id} className="border-b align-top">
                  <td className="whitespace-nowrap py-2.5 text-muted-foreground">
                    {new Date(l.createdAt).toLocaleString()}
                  </td>
                  <td className="py-2.5">{l.adminName}</td>
                  <td className="py-2.5">
                    <Badge variant="outline">{labelOf(l.action)}</Badge>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{l.action}</span>
                  </td>
                  <td className="py-2.5 font-mono text-xs">{l.target || "-"}</td>
                  <td className="max-w-72 truncate py-2.5 text-muted-foreground" title={l.detail ?? ""}>
                    {l.detail || "-"}
                  </td>
                  <td className="py-2.5 font-mono text-xs text-muted-foreground">{l.ip || "-"}</td>
                </tr>
              ))}
              {(data?.items?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    暂无日志
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
