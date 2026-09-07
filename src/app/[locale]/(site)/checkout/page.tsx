"use client";

import { useSyncExternalStore, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clearCart, getCartLines, subscribe, type CartLine } from "@/lib/cart-store";
import { formatMoney, safeDateLocale } from "@/lib/utils";

/**
 * 结算页(V4.0):收货信息表单 + 订单摘要 → POST /api/order。
 * 成功后把结果写入 sessionStorage 供成功页展示,并清空本地购物车。
 */
export default function CheckoutPage() {
  const t = useTranslations("shop");
  const router = useRouter();
  const pathname = usePathname();
  const locale = safeDateLocale(pathname.split("/")[1]);
  const lines = useSyncExternalStore(subscribe, getCartLines, () => [] as CartLine[]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    email: "",
    name: "",
    phone: "",
    country: "",
    address: "",
    city: "",
    zip: "",
    note: "",
  });

  // 登录用户预填邮箱/姓名(V4.0.1),可修改
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.data) {
          setForm((f) => ({
            ...f,
            email: f.email || d.data.email || "",
            name: f.name || d.data.name || "",
          }));
        }
      })
      .catch(() => {});
  }, []);

  const total = lines.reduce((n, l) => n + l.priceCents * l.qty, 0);
  const currency = lines[0]?.currency ?? "USD";

  async function submit() {
    if (lines.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: lines.map((l) => ({ contentId: l.contentId, qty: l.qty })),
          email: form.email,
          name: form.name,
          phone: form.phone || undefined,
          country: form.country,
          address: form.address,
          city: form.city,
          zip: form.zip || undefined,
          note: form.note || undefined,
          locale,
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.message || "下单失败");
      // 结果交给成功页展示(金额/付款指引);清空购物车
      sessionStorage.setItem(
        "aition_last_order",
        JSON.stringify({
          no: d.data.no,
          grandTotalCents: d.data.grandTotalCents,
          currency: d.data.currency,
          email: form.email,
          paymentInfo: d.data.paymentInfo ?? "",
        })
      );
      clearCart();
      router.push(`/${locale}/order/success`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "下单失败");
    } finally {
      setSubmitting(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  if (lines.length === 0) {
    return (
      <main className="container max-w-3xl py-10">
        <p className="rounded-lg border border-dashed p-16 text-center text-muted-foreground">{t("cartEmpty")}</p>
        <div className="mt-4 text-center">
          <Button asChild variant="outline">
            <Link href={`/${locale}`}>{t("continueShopping")}</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="container max-w-4xl py-10">
      <h1 className="mb-6 font-heading text-3xl font-bold">{t("checkout")}</h1>
      <div className="grid gap-8 lg:grid-cols-5">
        <section className="space-y-4 lg:col-span-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="co-email">{t("email")} *</Label>
              <Input id="co-email" type="email" value={form.email} onChange={set("email")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="co-name">{t("name")} *</Label>
              <Input id="co-name" value={form.name} onChange={set("name")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="co-phone">{t("phone")}</Label>
              <Input id="co-phone" value={form.phone} onChange={set("phone")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="co-country">{t("country")} *</Label>
              <Input id="co-country" value={form.country} onChange={set("country")} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="co-address">{t("address")} *</Label>
              <Input id="co-address" value={form.address} onChange={set("address")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="co-city">{t("city")} *</Label>
              <Input id="co-city" value={form.city} onChange={set("city")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="co-zip">{t("zip")}</Label>
              <Input id="co-zip" value={form.zip} onChange={set("zip")} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="co-note">{t("note")}</Label>
              <textarea id="co-note" className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.note} onChange={set("note")} />
            </div>
          </div>
        </section>

        <aside className="h-fit rounded-xl border bg-card p-5 lg:col-span-2">
          <h2 className="font-heading text-lg font-semibold">{t("orderSummary")}</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {lines.map((l) => (
              <li key={l.contentId} className="flex justify-between gap-2">
                <span className="line-clamp-1 text-muted-foreground">
                  {l.title} × {l.qty}
                </span>
                <span>{formatMoney(l.priceCents * l.qty, l.currency, locale)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-between border-t pt-3 font-semibold">
            <span>{t("grandTotal")}</span>
            <span className="font-heading text-lg">{formatMoney(total, currency, locale)}</span>
          </div>
          {/* 运费/付款方式在服务端计算后于成功页展示(线下付款) */}
          <Button size="lg" className="mt-5 w-full" disabled={submitting} onClick={submit}>
            {submitting ? "…" : t("placeOrder")}
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">{t("orderPlacedDesc")}</p>
        </aside>
      </div>
    </main>
  );
}
