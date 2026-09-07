"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiGet } from "@/components/admin/api-client";
import { formatMoney } from "@/lib/utils";

/**
 * 订单管理列表页(V4.0;V4.0.1 瘦身):状态页签 + 关键词 + 下单时间区间检索;
 * 详情移至独立页 /admin/orders/[id](含操作与物流表单)。
 */
interface OrderRow {
  id: number;
  no: string;
  status: string;
  email: string;
  name: string;
  currency: string;
  grandTotalCents: number;
  createdAt: string;
}

const STATUS_TABS = [
  { key: "", label: "全部" },
  { key: "PENDING", label: "待确认" },
  { key: "CONFIRMED", label: "已确认收款" },
  { key: "SHIPPED", label: "已发货" },
  { key: "COMPLETED", label: "已完成" },
  { key: "CANCELLED", label: "已取消" },
];

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  CONFIRMED: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  SHIPPED: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  CANCELLED: "bg-muted text-muted-foreground",
};

export default function OrdersPage() {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; page: number; pageSize: number; items: OrderRow[] } | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (status) params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const d = await apiGet<{ total: number; page: number; pageSize: number; items: OrderRow[] }>(
        `/api/admin/orders?${params.toString()}`
      );
      setData(d);
    } catch {
      toast.error("订单加载失败");
    }
  }, [status, q, from, to, page]);

  useEffect(() => {
    load();
  }, [load]);

  function resetFilters() {
    setQ("");
    setFrom("");
    setTo("");
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">订单管理</h1>
        <p className="text-sm text-muted-foreground">线下付款订单的确认、发货与取消;详情页内操作并自动邮件通知买家</p>
      </div>

      {/* 状态页签 */}
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((tab) => (
          <Button
            key={tab.key}
            size="sm"
            variant={status === tab.key ? "default" : "outline"}
            onClick={() => {
              setStatus(tab.key);
              setPage(1);
            }}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* 检索:关键词 + 下单时间区间(V4.0.1) */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-56"
          placeholder="订单号 / 邮箱 / 姓名…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (setPage(1), load())}
        />
        <span className="text-sm text-muted-foreground">下单时间</span>
        <Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="text-muted-foreground">至</span>
        <Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        <Button size="sm" variant="outline" onClick={() => (setPage(1), load())}>
          查询
        </Button>
        {(q || from || to) && (
          <Button size="sm" variant="ghost" onClick={resetFilters}>
            重置
          </Button>
        )}
      </div>

      {/* 列表 */}
      <Card>
        <CardContent className="pt-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2">订单号</th>
                <th className="py-2">买家</th>
                <th className="py-2">金额</th>
                <th className="py-2">状态</th>
                <th className="py-2">下单时间</th>
                <th className="py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((o) => (
                <tr key={o.id} className="border-b">
                  <td className="py-2.5 font-mono text-xs">{o.no}</td>
                  <td className="py-2.5">
                    {o.name}
                    <span className="ml-2 text-xs text-muted-foreground">{o.email}</span>
                  </td>
                  <td className="py-2.5 font-medium">{formatMoney(o.grandTotalCents, o.currency, "zh-CN")}</td>
                  <td className="py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[o.status] ?? ""}`}>
                      {STATUS_TABS.find((t) => t.key === o.status)?.label ?? o.status}
                    </span>
                  </td>
                  <td className="py-2.5 text-muted-foreground">{new Date(o.createdAt).toLocaleString()}</td>
                  <td className="py-2.5 text-right">
                    <Button size="sm" variant="outline" onClick={() => router.push(`/zh-CN/admin/orders/${o.id}`)}>
                      详情
                    </Button>
                  </td>
                </tr>
              ))}
              {(data?.items?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    暂无订单
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {data && data.total > data.pageSize && (
            <div className="mt-4 flex items-center justify-end gap-2 text-sm">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                上一页
              </Button>
              <span className="text-muted-foreground">
                第 {page} 页 / 共 {Math.ceil(data.total / data.pageSize)} 页({data.total} 单)
              </span>
              <Button size="sm" variant="outline" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>
                下一页
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
