import { setRequestLocale, getTranslations } from "next-intl/server";
import { getShopConfig } from "@/server/shop";
import { CartPageClient } from "@/app/[locale]/(site)/cart/cart-client";
import type { Metadata } from "next";

/**
 * 购物车页(V4.3 服务端壳):读下单开关——关闭时服务端直接渲染提示页(SSR 即生效),
 * 开启时渲染客户端交互体(cart-client)。
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function CartPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const shop = await getShopConfig();

  if (!shop.orderingEnabled) {
    const t = await getTranslations("shop");
    return (
      <main className="container max-w-2xl py-16 text-center">
        <h1 className="font-heading text-2xl font-bold">{t("orderingClosedTitle")}</h1>
        <p className="mt-3 text-muted-foreground">{t("orderingClosedDesc")}</p>
      </main>
    );
  }

  return <CartPageClient />;
}
