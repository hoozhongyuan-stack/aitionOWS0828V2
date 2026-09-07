"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Check, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addToCart } from "@/lib/cart-store";

/**
 * 加购按钮(V4.0):写 localStorage 购物车,成功后短暂显示已加入并提供前往结算入口。
 * 价格以结算时服务端重算为准,此处快照仅展示。
 */
export function AddToCartButton({
  locale,
  contentId,
  slug,
  title,
  priceCents,
  currency,
  coverUrl,
}: {
  locale: string;
  contentId: number;
  slug: string;
  title: string;
  priceCents: number;
  currency: string;
  coverUrl?: string | null;
}) {
  const t = useTranslations("shop");
  const [added, setAdded] = useState(false);

  if (added) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
          <Check className="h-4 w-4" />
          {t("added")}
        </span>
        <Button asChild size="sm" variant="outline">
          <Link href={`/${locale}/cart`}>{t("goCheckout")}</Link>
        </Button>
      </div>
    );
  }
  return (
    <Button
      size="lg"
      onClick={() => {
        addToCart({ contentId, slug, title, priceCents, currency, coverUrl });
        setAdded(true);
      }}
    >
      <ShoppingCart className="mr-2 h-4 w-4" />
      {t("addToCart")}
    </Button>
  );
}
