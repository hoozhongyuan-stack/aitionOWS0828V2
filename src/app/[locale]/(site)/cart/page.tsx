"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCartLines, removeLine, setQty, subscribe, type CartLine } from "@/lib/cart-store";
import { formatMoney, safeDateLocale } from "@/lib/utils";

/**
 * 购物车页(V4.0):localStorage 条目管理;金额为展示快照,结算时服务端重算。
 */
export default function CartPage() {
  const t = useTranslations("shop");
  const pathname = usePathname();
  const locale = safeDateLocale(pathname.split("/")[1]);
  const lines = useSyncExternalStore(subscribe, getCartLines, () => [] as CartLine[]);

  const total = lines.reduce((n, l) => n + l.priceCents * l.qty, 0);
  const currency = lines[0]?.currency ?? "USD";

  return (
    <main className="container max-w-4xl py-10">
      <h1 className="mb-6 font-heading text-3xl font-bold">{t("cart")}</h1>

      {lines.length === 0 ? (
        <div className="rounded-lg border border-dashed p-16 text-center">
          <p className="text-muted-foreground">{t("cartEmpty")}</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href={`/${locale}`}>{t("continueShopping")}</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {lines.map((l) => (
            <div key={l.contentId} className="flex items-center gap-4 rounded-xl border bg-card p-4">
              <Link href={`/${locale}/product/${l.slug}`} className="shrink-0">
                {l.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.coverUrl} alt={l.title} className="h-16 w-24 rounded-lg object-cover" />
                ) : (
                  <div className="h-16 w-24 rounded-lg bg-muted" aria-hidden />
                )}
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={`/${locale}/product/${l.slug}`} className="line-clamp-1 font-medium hover:text-primary">
                  {l.title}
                </Link>
                <p className="mt-1 text-sm text-muted-foreground">{formatMoney(l.priceCents, l.currency, locale)}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" className="h-7 w-7" aria-label="minus" onClick={() => setQty(l.contentId, l.qty - 1)}>
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <span className="w-8 text-center text-sm">{l.qty}</span>
                <Button size="icon" variant="outline" className="h-7 w-7" aria-label="plus" onClick={() => setQty(l.contentId, l.qty + 1)}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              <span className="w-24 text-right text-sm font-semibold">{formatMoney(l.priceCents * l.qty, l.currency, locale)}</span>
              <Button size="icon" variant="ghost" aria-label={t("remove")} onClick={() => removeLine(l.contentId)}>
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          ))}

          <div className="flex items-center justify-between rounded-xl border bg-card p-4">
            <span className="text-sm text-muted-foreground">
              {t("itemsTotal")}({lines.length})
            </span>
            <span className="font-heading text-xl font-bold">{formatMoney(total, currency, locale)}</span>
          </div>
          <div className="flex justify-end gap-3">
            <Button asChild variant="outline">
              <Link href={`/${locale}`}>{t("continueShopping")}</Link>
            </Button>
            <Button asChild size="lg">
              {/* 币种混购由结算服务端校验兜底;入口固定携带 */}
              <Link href={`/${locale}/checkout`}>{t("goCheckout")}</Link>
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
