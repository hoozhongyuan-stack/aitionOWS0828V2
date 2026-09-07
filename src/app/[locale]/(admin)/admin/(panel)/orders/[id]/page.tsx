"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPost } from "@/components/admin/api-client";
import { formatMoney } from "@/lib/utils";

/**
 * 订单详情独立页(V4.0.1):完整信息 + 状态流转操作。
 * 发货表单三项:物流公司/物流编号/备注(均非必填);操作二次确认,后台与前台订单展示同源。
 */
interface OrderDetail {
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
  shippingCarrier: string | null;
  trackingNumber: string | null;
  createdAt: string;
  confirmedAt: string | null;
  shippedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  items: { id: number; contentId: number; titleSnapshot: string; priceCentsSnapshot: number; currency: string; qty: number }[];
}

const STATUS_TABS: Record<string, string> = {
  PENDING: "待确认",
  CONFIRMED: "已确认收款",
  SHIPPED: "已发货",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  CONFIRMED: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  SHIPPED: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  CANCELLED: "bg-muted text-muted-foreground",
};

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [busy, setBusy] = useState(false);
  // 发货三字段(V4.0.1):物流公司/物流编号/备注,均非必填
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [remark, setRemark] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await apiGet<OrderDetail>(`/api/admin/orders?id=${params.id}`);
      setOrder(d);
      setCarrier(d.shippingCarrier ?? "");
      setTracking(d.trackingNumber ?? "");
      setRemark(d.adminNote ?? "");
    } catch {
      toast.error("订单加载失败");
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(action: "confirm" | "ship" | "complete" | "cancel") {
    if (!order) return;
    const labels: Record<string, string> = { confirm: "确认收款", ship: "标记发货", complete: "标记完成", cancel: "取消订单" };
    if (!window.confirm(`确定「${labels[action]}」?${action === "cancel" ? "将通知买家订单已取消。" : ""}`)) return;
    setBusy(true);
    try {
      const d = await apiPost<OrderDetail>("/api/admin/orders", {
        id: order.id,
        action,
        adminNote: remark || undefined,
        ...(action === "ship" ? { shippingCarrier: carrier || undefined, trackingNumber: tracking || undefined } : {}),
      });
      setOrder(d);
      toast.success(`已${labels[action]}${action === "ship" ? ",通知邮件已发出" : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  if (!order) return <div className="text-sm text-muted-foreground">加载中…</div>;

  const shipped = order.status === "SHIPPED" || order.status === "COMPLETED";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild size="sm" variant="ghost">
          <Link href="/zh-CN/admin/orders">← 返回列表</Link>
        </Button>
        <h1 className="text-2xl font-semibold">订单详情</h1>
        <span className="font-mono text-sm text-muted-foreground">{order.no}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[order.status] ?? ""}`}>
          {STATUS_TABS[order.status] ?? order.status}
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>买家与收货</CardTitle>
          <CardDescription>
            {order.name} · {order.email} · {order.phone || "无电话"} · 下单于{" "}
            {new Date(order.createdAt).toLocaleString()}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border p-3 text-sm">
            <p className="mb-1 font-medium">收货地址</p>
            <p className="text-muted-foreground">
              {order.country} · {order.city} · {order.zip || "无邮编"}
              <br />
              {order.address}
            </p>
          </div>
          <div className="rounded-lg border p-3 text-sm">
            <p className="mb-1 font-medium">买家备注</p>
            <p className="text-muted-foreground">{order.note || "无"}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>商品明细</CardTitle>
        </CardHeader>
        <CardContent>
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
              {order.items.map((i) => (
                <tr key={i.id} className="border-b">
                  <td className="py-2">{i.titleSnapshot}</td>
                  <td className="py-2 text-right">{formatMoney(i.priceCentsSnapshot, i.currency, "zh-CN")}</td>
                  <td className="py-2 text-right">{i.qty}</td>
                  <td className="py-2 text-right">{formatMoney(i.priceCentsSnapshot * i.qty, i.currency, "zh-CN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 space-y-1 text-right text-sm">
            <p className="text-muted-foreground">
              商品合计 {formatMoney(order.itemsTotalCents, order.currency, "zh-CN")} · 运费{" "}
              {order.shippingCents > 0 ? formatMoney(order.shippingCents, order.currency, "zh-CN") : "免运费"}
            </p>
            <p className="font-heading text-lg font-bold">
              应付总额 {formatMoney(order.grandTotalCents, order.currency, "zh-CN")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 物流信息(发货后展示) */}
      {shipped && (order.shippingCarrier || order.trackingNumber || order.adminNote) && (
        <Card>
          <CardHeader>
            <CardTitle>物流信息</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {order.shippingCarrier && (
              <p>
                物流公司:{order.shippingCarrier}
              </p>
            )}
            {order.trackingNumber && (
              <p>
                物流编号:{order.trackingNumber}
              </p>
            )}
            {order.adminNote && <p>备注:{order.adminNote}</p>}
            {order.shippedAt && <p className="mt-1 text-xs">发货时间:{new Date(order.shippedAt).toLocaleString()}</p>}
          </CardContent>
        </Card>
      )}

      {/* 操作区(终态无操作) */}
      {!["COMPLETED", "CANCELLED"].includes(order.status) && (
        <Card>
          <CardHeader>
            <CardTitle>操作</CardTitle>
            <CardDescription>状态变更将自动邮件通知买家;发货信息与备注随发货邮件发出</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {order.status === "CONFIRMED" && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>物流公司(非必填)</Label>
                  <Input placeholder="如 DHL / 顺丰" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>物流编号(非必填)</Label>
                  <Input placeholder="运单号" value={tracking} onChange={(e) => setTracking(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>备注(非必填)</Label>
                  <Input value={remark} onChange={(e) => setRemark(e.target.value)} />
                </div>
              </div>
            )}
            {order.status !== "CONFIRMED" && (
              <Input
                placeholder={order.status === "PENDING" ? "备注(可选;取消时作为原因通知买家)" : "备注(可选)"}
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
              />
            )}
            <div className="flex flex-wrap gap-2">
              {order.status === "PENDING" && (
                <Button disabled={busy} onClick={() => act("confirm")}>
                  确认收款
                </Button>
              )}
              {order.status === "CONFIRMED" && (
                <Button disabled={busy} onClick={() => act("ship")}>
                  标记发货
                </Button>
              )}
              {order.status === "SHIPPED" && (
                <Button disabled={busy} onClick={() => act("complete")}>
                  标记完成
                </Button>
              )}
              {["PENDING", "CONFIRMED", "SHIPPED"].includes(order.status) && (
                <Button variant="destructive" disabled={busy} onClick={() => act("cancel")}>
                  取消订单
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
