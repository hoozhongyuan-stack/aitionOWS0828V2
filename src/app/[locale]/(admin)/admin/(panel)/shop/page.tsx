"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPut } from "@/components/admin/api-client";
import { CURRENCIES } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * 商店设置(V4.0):站点默认币种 / 线下付款指引 / 运费策略。
 * 存 Setting(group="shop");保存即生效。
 */
interface ShopValues {
  currency: string;
  paymentInfo: string;
  shippingFee: string; // 元(展示层),提交时换算分
  freeShippingOver: string; // 元;空=不启用
}

export default function ShopSettingsPage() {
  const [values, setValues] = useState<ShopValues | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet<{ currency?: string; paymentInfo?: string; shippingFeeCents?: number; freeShippingOverCents?: number | null }>(
      "/api/admin/settings/shop"
    )
      .then((v) =>
        setValues({
          currency: v.currency ?? "USD",
          paymentInfo: v.paymentInfo ?? "",
          shippingFee: v.shippingFeeCents != null ? String(v.shippingFeeCents / 100) : "0",
          freeShippingOver: v.freeShippingOverCents != null ? String(v.freeShippingOverCents / 100) : "",
        })
      )
      .catch(() => toast.error("商店设置加载失败"));
  }, []);

  if (!values) return <div className="text-sm text-muted-foreground">加载中…</div>;

  async function save() {
    if (!values) return;
    setSaving(true);
    try {
      const cents = (v: string) => (v.trim() === "" ? null : Math.round(Number(v) * 100));
      await apiPut("/api/admin/settings/shop", {
        values: {
          currency: values.currency,
          paymentInfo: values.paymentInfo,
          shippingFeeCents: cents(values.shippingFee) ?? 0,
          freeShippingOverCents: cents(values.freeShippingOver),
        },
      });
      toast.success("已保存,商店设置立即生效");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">商店设置</h1>
        <p className="text-sm text-muted-foreground">
          币种、线下付款指引与运费策略(V4.0);保存后前台立即生效。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>币种与付款</CardTitle>
          <CardDescription>
            默认币种用于未单独指定币种的商品;付款指引展示在下单成功页与买家下单确认邮件中
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>站点默认币种</Label>
            <Select value={values.currency} onValueChange={(v) => setValues({ ...values, currency: v })}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>线下付款指引(银行账户 / PayPal 等)</Label>
            <textarea
              className="min-h-32 w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder={"例如:\nBank: HSBC ……\nAccount: ……\nSWIFT: ……\n或 PayPal: pay@example.com"}
              value={values.paymentInfo}
              onChange={(e) => setValues({ ...values, paymentInfo: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">买家提交订单后按此指引线下付款,你在后台确认收款后订单进入备货</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>运费</CardTitle>
          <CardDescription>结算时自动计算;仅对有价格的商品订单生效</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>固定运费({values.currency},0 = 免运费)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              className="w-48"
              value={values.shippingFee}
              onChange={(e) => setValues({ ...values, shippingFee: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>满额免运费门槛({values.currency},留空 = 不启用)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              className="w-48"
              placeholder="如 200"
              value={values.freeShippingOver}
              onChange={(e) => setValues({ ...values, freeShippingOver: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving}>
        {saving ? "保存中…" : "保存"}
      </Button>
    </div>
  );
}
