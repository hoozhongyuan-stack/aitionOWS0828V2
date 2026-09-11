"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiGet } from "@/components/admin/api-client";
import { TablePagination } from "@/components/admin/table-pagination";
import { useBatchSelection } from "@/components/admin/use-batch-selection";
import { BatchActionBar, runBatchAction } from "@/components/admin/batch-action-bar";
import { formatMoney } from "@/lib/utils";

/**
 * 订单管理列表页(V4.0;V4.0.1 瘦身):状态页签 + 关键词 + 下单时间区间检索;
 * 详情移至独立页 /admin/orders/[id](含操作与物流表单)。
 */
interface OrderRow {
  accountName?: string | null;
  accountEmail?: string | null;
  refund?: { id: number; status: string } | null;
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
  { key: "REFUNDED", label: "已退款" },
  { key: "__refundPending", label: "售后中" },
];

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  CONFIRMED: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  SHIPPED: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  CANCELLED: "bg-muted text-muted-foreground",
  REFUNDED: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
};

export default function OrdersPage() {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10); // V4.0.2:默认 10,可 50/100
  const [data, setData] = useState<{ total: number; page: number; pageSize: number; items: OrderRow[] } | null>(null);

  // V4.4.2 批量流转(仅正向动作;见 doBatch 的说明)
  const batch = useBatchSelection<OrderRow>();
  const clearBatch = batch.clear;

  const load = useCallback(async () => {
    clearBatch(); // 翻页/筛选切换时清空选择,避免"选中了看不见的项"
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (status === "__refundPending") params.set("refundPending", "1");
      else if (status) params.set("status", status);
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
  }, [status, q, from, to, page, pageSize, clearBatch]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * V4.4.2 批量流转:只做三个正向动作(确认收款/标记发货/标记完成)。
   * 有意不支持的两个:取消订单(破坏性)、退款(涉及金额核定,必须单个走审批)。
   * 状态机自身会拦下非法流转(如对未付款订单"发货"),这些项由服务端计入 skipped 并回报原因。
   */
  async function doBatch(action: "confirm" | "ship" | "complete") {
    try {
      const summary = await runBatchAction("/api/admin/orders/batch", Array.from(batch.selected), action);
      toast.success(summary);
      clearBatch();
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "批量操作失败");
    }
  }

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
      <BatchActionBar count={batch.count} onClear={batch.clear}>
        <Button size="sm" variant="outline" onClick={() => doBatch("confirm")}>
          批量确认收款
        </Button>
        <Button size="sm" variant="outline" onClick={() => doBatch("ship")}>
          批量标记发货
        </Button>
        <Button size="sm" variant="outline" onClick={() => doBatch("complete")}>
          批量标记完成
        </Button>
      </BatchActionBar>

      <Card>
        <CardContent className="pt-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="w-10 py-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary align-middle"
                    checked={batch.allSelected(data?.items ?? [])}
                    ref={(el) => {
                      if (el) el.indeterminate = batch.someSelected(data?.items ?? []);
                    }}
                    onChange={() => batch.toggleAll(data?.items ?? [])}
                    aria-label="全选本页"
                  />
                </th>
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
                  <td className="w-10 py-2.5">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary align-middle"
                      checked={batch.selected.has(o.id)}
                      onChange={() => batch.toggle(o.id)}
                      aria-label="选择此订单"
                    />
                  </td>
                  <td className="py-2.5 font-mono text-xs">{o.no}</td>
                  <td className="py-2.5">
                    <div className="font-medium">{o.name}</div>
                    <div className="text-xs text-muted-foreground">{o.email}</div>
                    <div className="text-xs text-muted-foreground/70">
                      {o.accountName ? `下单账号: ${o.accountName}` : "游客下单"}
                    </div>
                  </td>
                  <td className="py-2.5 font-medium">{formatMoney(o.grandTotalCents, o.currency, "zh-CN")}</td>
                  <td className="py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[o.status] ?? ""}`}>
                      {STATUS_TABS.find((t) => t.key === o.status)?.label ?? o.status}
                    </span>
                    {o.refund?.status === "PENDING" && (
                      <span className="ml-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                        售后中
                      </span>
                    )}
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
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    暂无订单
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {data && (
            <div className="mt-4">
              <TablePagination
                total={data.total}
                page={page}
                pageSize={pageSize}
                onPage={(p) => setPage(p)}
                onPageSize={(n) => {
                  setPageSize(n);
                  setPage(1);
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
