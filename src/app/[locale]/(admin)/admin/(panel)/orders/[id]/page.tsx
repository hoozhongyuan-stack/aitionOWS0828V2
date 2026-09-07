"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  items: { id: number; contentId: number; titleSnapshot: string; priceCentsSnapshot: number; currency: string; qty: number; spu: string | null; coverUrl: string | null }[];
  refund: { id: number; reason: string; status: string; refundAmountCents: number | null; adminNote: string | null; createdAt: string; reviewedAt: string | null } | null;
}

/** 一键复制(剪贴板;非安全上下文降级) */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

const STATUS_TABS: Record<string, string> = {
  PENDING: "待确认",
  CONFIRMED: "已确认收款",
  SHIPPED: "已发货",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  REFUNDED: "已退款",
};

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  CONFIRMED: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  SHIPPED: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  CANCELLED: "bg-muted text-muted-foreground",
  REFUNDED: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
};

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [busy, setBusy] = useState(false);
  // 发货三字段(V4.0.1):物流公司/物流编号/备注,均非必填
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [remark, setRemark] = useState("");
  const [refundAmount, setRefundAmount] = useState(""); // 售后退款金额(元;V4.2)
  const [refundNote, setRefundNote] = useState("");

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

  async function act(action: "confirm" | "ship" | "complete" | "cancel" | "refundApprove" | "refundReject") {
    if (!order) return;
    const labels: Record<string, string> = {
      confirm: "确认收款",
      ship: "标记发货",
      complete: "标记完成",
      cancel: "取消订单",
      refundApprove: "通过售后退款",
      refundReject: "拒绝售后",
    };
    if (
      !window.confirm(
        `确定「${labels[action]}」?${action === "cancel" ? "将通知买家订单已取消。" : action.startsWith("refund") ? "将邮件通知买家审核结果。" : ""}`
      )
    )
      return;
    setBusy(true);
    try {
      if (action === "refundApprove" || action === "refundReject") {
        // 售后审核(V4.2):通过金额留空自动取订单实付
        const cents =
          action === "refundApprove"
            ? refundAmount.trim() === ""
              ? order.grandTotalCents
              : Math.round(Number(refundAmount) * 100)
            : undefined;
        await apiPost("/api/admin/orders", {
          id: order.refund!.id,
          action,
          adminNote: refundNote || undefined,
          refundAmountCents: cents,
        });
        toast.success(`已${labels[action]},邮件已通知买家`);
        load();
        return;
      }
      const d = await apiPost<OrderDetail>("/api/admin/orders", {
        id: order.id,
        action,
        adminNote: remark || undefined,
        ...(action === "ship" ? { shippingCarrier: carrier || undefined, trackingNumber: tracking || undefined } : {}),
      });
      setOrder(d);
      toast.success(`已${labels[action]}${action === "ship" ? ",通知邮件已发出" : ""}`);
      load();
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
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-medium">收货信息</p>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={async () => {
                  // 一键复制全部收货信息(键值对拼接;V4.0.2 用户确认的交互形态)
                  const text = [
                    `订单号: ${order.no}`,
                    `姓名: ${order.name}`,
                    `邮箱: ${order.email}`,
                    `电话: ${order.phone || "-"}`,
                    `国家: ${order.country}`,
                    `城市: ${order.city}`,
                    `邮编: ${order.zip || "-"}`,
                    `地址: ${order.country} ${order.city} ${order.address}${order.zip ? " " + order.zip : ""}`,
                  ].join("\n");
                  const ok = await copyText(text);
                  if (ok) toast.success("收货信息已复制");
                  else toast.error("复制失败,请手动选择复制");
                }}
              >
                复制全部
              </Button>
            </div>
            <dl className="space-y-1.5">
              {(
                [
                  ["姓名", order.name],
                  ["邮箱", order.email],
                  ["电话", order.phone || "-"],
                  ["国家/地区", order.country],
                  ["城市", order.city],
                  ["邮编", order.zip || "-"],
                  ["详细地址", order.address],
                ] as [string, string][]
              ).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="w-20 shrink-0 text-muted-foreground">{k}</dt>
                  <dd className="min-w-0 break-all font-medium">{v}</dd>
                </div>
              ))}
            </dl>
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
                  <td className="py-2">
                    <div className="flex items-center gap-3">
                      {i.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={i.coverUrl} alt={i.titleSnapshot} className="h-10 w-14 shrink-0 rounded object-cover" />
                      ) : (
                        <div className="h-10 w-14 shrink-0 rounded bg-muted" aria-hidden />
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-medium">{i.titleSnapshot}</p>
                        {i.spu && <p className="text-xs text-muted-foreground">SPU: {i.spu}</p>}
                      </div>
                    </div>
                  </td>
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

      {/* 售后审核(V4.2) */}
      {order.refund && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              售后申请
              <Badge variant={order.refund.status === "PENDING" ? "secondary" : order.refund.status === "APPROVED" ? "default" : "outline"}>
                {order.refund.status === "PENDING" ? "待审核" : order.refund.status === "APPROVED" ? "已通过" : "已拒绝"}
              </Badge>
            </CardTitle>
            <CardDescription>
              申请于 {new Date(order.refund.createdAt).toLocaleString()}
              {order.refund.reviewedAt && ` · 处理于 ${new Date(order.refund.reviewedAt).toLocaleString()}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              <span className="text-muted-foreground">售后原因:</span>
              {order.refund.reason}
            </p>
            {order.refund.status === "PENDING" ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>退款金额({order.currency},必填,≤实付)</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      实付 {formatMoney(order.grandTotalCents, order.currency, "zh-CN")};留空点「通过」将以实付金额退款
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>审核备注(通过:说明/拒绝:原因,随邮件通知买家)</Label>
                    <Input value={refundNote} onChange={(e) => setRefundNote(e.target.value)} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button disabled={busy} onClick={() => act("refundApprove")}>
                    通过并退款
                  </Button>
                  <Button variant="destructive" disabled={busy} onClick={() => act("refundReject")}>
                    拒绝
                  </Button>
                </div>
              </>
            ) : (
              <div className="rounded-md bg-muted p-3">
                {order.refund.status === "APPROVED" && order.refund.refundAmountCents != null && (
                  <p>
                    退款金额:
                    <span className="font-semibold">
                      {formatMoney(order.refund.refundAmountCents, order.currency, "zh-CN")}
                    </span>
                  </p>
                )}
                {order.refund.adminNote && <p className="text-muted-foreground">备注:{order.refund.adminNote}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 操作区(终态无操作) */}
      {!["COMPLETED", "CANCELLED", "REFUNDED"].includes(order.status) && (
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
