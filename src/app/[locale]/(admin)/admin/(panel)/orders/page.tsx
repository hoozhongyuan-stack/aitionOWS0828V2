"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiGet, apiPost } from "@/components/admin/api-client";
import { formatMoney } from "@/lib/utils";

/**
 * 订单管理(V4.0):状态页签 + 搜索 + 分页;行点击展开详情区执行状态流转。
 * 状态机:PENDING→CONFIRMED→SHIPPED→COMPLETED,非终态可 CANCELLED(后台统一处理)。
 */
interface OrderItem {
  id: number;
  contentId: number;
  titleSnapshot: string;
  priceCentsSnapshot: number;
  currency: string;
  qty: number;
}
interface Order {
  id: number;
  no: string;
  status: string;
  email: string;
  name: string;
  phone: string | null;
  country: string;
  address: string;
  city: string;
  zip: string | null;
  note: string | null;
  currency: string;
  itemsTotalCents: number;
  shippingCents: number;
  grandTotalCents: number;
  adminNote: string | null;
  createdAt: string;
  confirmedAt: string | null;
  shippedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  items: OrderItem[];
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
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; page: number; pageSize: number; items: Order[] } | null>(null);
  const [selected, setSelected] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [remark, setRemark] = useState("");

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (status) params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      const d = await apiGet<{ total: number; page: number; pageSize: number; items: Order[] }>(
        `/api/admin/orders?${params.toString()}`
      );
      setData(d);
    } catch {
      toast.error("订单加载失败");
    }
  }, [status, q, page]);

  useEffect(() => {
    load();
  }, [load]);

  async function openDetail(id: number) {
    try {
      const d = await apiGet<Order>(`/api/admin/orders?id=${id}`);
      setSelected(d);
      setRemark(d.adminNote ?? "");
    } catch {
      toast.error("详情加载失败");
    }
  }

  async function act(action: "confirm" | "ship" | "complete" | "cancel") {
    if (!selected) return;
    const labels: Record<string, string> = { confirm: "确认收款", ship: "标记发货", complete: "标记完成", cancel: "取消订单" };
    if (!window.confirm(`确定「${labels[action]}」?${action === "cancel" ? "将通知买家订单已取消。" : ""}`)) return;
    setBusy(true);
    try {
      const d = await apiPost<Order>("/api/admin/orders", { id: selected.id, action, adminNote: remark || undefined });
      setSelected(d);
      toast.success(`已${labels[action]}`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">订单管理</h1>
        <p className="text-sm text-muted-foreground">
          线下付款订单的确认、发货与取消;状态变更将自动邮件通知买家
        </p>
      </div>

      {/* 状态页签 + 搜索 */}
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
        <div className="ml-auto flex gap-2">
          <Input
            className="w-56"
            placeholder="订单号 / 邮箱 / 姓名…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            onKeyDown={(e) => e.key === "Enter" && load()}
          />
          <Button size="sm" variant="outline" onClick={load}>
            查询
          </Button>
        </div>
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
                    <Button size="sm" variant="outline" onClick={() => openDetail(o.id)}>
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

      {/* 详情与操作 */}
      {selected && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              订单详情
              <span className="font-mono text-sm font-normal text-muted-foreground">{selected.no}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-normal ${STATUS_BADGE[selected.status] ?? ""}`}>
                {STATUS_TABS.find((t) => t.key === selected.status)?.label ?? selected.status}
              </span>
            </CardTitle>
            <CardDescription>
              {selected.name} · {selected.email} · {selected.phone || "无电话"} · 下单于 {new Date(selected.createdAt).toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border p-3 text-sm">
                <p className="mb-1 font-medium">收货信息</p>
                <p className="text-muted-foreground">
                  {selected.country} · {selected.city} · {selected.zip || "无邮编"}
                  <br />
                  {selected.address}
                </p>
              </div>
              <div className="rounded-lg border p-3 text-sm">
                <p className="mb-1 font-medium">买家备注</p>
                <p className="text-muted-foreground">{selected.note || "无"}</p>
              </div>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2">商品</th>
                  <th className="py-2 text-right">单价</th>
                  <th className="py-2 text-right">数量</th>
                  <th className="py-2 text-right">小计</th>
                </tr>
              </thead>
              <tbody>
                {selected.items.map((i) => (
                  <tr key={i.id} className="border-b">
                    <td className="py-2">{i.titleSnapshot}</td>
                    <td className="py-2 text-right">{formatMoney(i.priceCentsSnapshot, i.currency, "zh-CN")}</td>
                    <td className="py-2 text-right">{i.qty}</td>
                    <td className="py-2 text-right">{formatMoney(i.priceCentsSnapshot * i.qty, i.currency, "zh-CN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="space-y-1 text-right text-sm">
              <p className="text-muted-foreground">
                商品合计 {formatMoney(selected.itemsTotalCents, selected.currency, "zh-CN")} · 运费{" "}
                {selected.shippingCents > 0 ? formatMoney(selected.shippingCents, selected.currency, "zh-CN") : "免运费"}
              </p>
              <p className="font-heading text-lg font-bold">
                应付总额 {formatMoney(selected.grandTotalCents, selected.currency, "zh-CN")}
              </p>
            </div>

            <div className="space-y-2">
              <Input
                placeholder="备注(发货填物流单号/取消填原因;会随通知邮件发出)"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                {selected.status === "PENDING" && (
                  <Button disabled={busy} onClick={() => act("confirm")}>
                    确认收款
                  </Button>
                )}
                {selected.status === "CONFIRMED" && (
                  <Button disabled={busy} onClick={() => act("ship")}>
                    标记发货
                  </Button>
                )}
                {selected.status === "SHIPPED" && (
                  <Button disabled={busy} onClick={() => act("complete")}>
                    标记完成
                  </Button>
                )}
                {["PENDING", "CONFIRMED", "SHIPPED"].includes(selected.status) && (
                  <Button variant="destructive" disabled={busy} onClick={() => act("cancel")}>
                    取消订单
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setSelected(null)}>
                  关闭
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
