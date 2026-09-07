"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney, safeDateLocale } from "@/lib/utils";

/**
 * 下单成功页(V4.0):展示订单号/金额/线下付款指引(商店设置内容,SSR 注入 props 需服务端;
 * MVP 从 sessionStorage 取下单结果,指引由本页客户端 GET /api/order/… 之外的轻量方式:
 * 直接由 checkout 跳转前一并写入)。查询入口供之后回查(邮箱+订单号)。
 */
interface LastOrder {
  no: string;
  grandTotalCents: number;
  currency: string;
  email: string;
  paymentInfo?: string;
}

export default function OrderSuccessPage() {
  const t = useTranslations("shop");
  const pathname = usePathname();
  const locale = safeDateLocale(pathname.split("/")[1]);
  const [order, setOrder] = useState<LastOrder | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("aition_last_order");
      if (raw) setOrder(JSON.parse(raw));
    } catch {
      /* 无结果(直接访问):展示通用文案 */
    }
  }, []);

  return (
    <main className="container max-w-2xl py-16">
      <div className="flex flex-col items-center gap-4 text-center">
        <CheckCircle2 className="h-14 w-14 text-primary" />
        <h1 className="font-heading text-3xl font-bold">{t("orderPlaced")}</h1>
        {order && (
          <p className="text-sm text-muted-foreground">
            {t("orderNo")}: <span className="font-mono font-semibold text-foreground">{order.no}</span>
          </p>
        )}
        <p className="max-w-md text-muted-foreground">{t("orderPlacedDesc")}</p>

        {order && (
          <div className="mt-4 w-full rounded-xl border bg-card p-6 text-left">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("grandTotal")}</span>
              <span className="font-heading text-2xl font-bold">
                {formatMoney(order.grandTotalCents, order.currency, locale)}
              </span>
            </div>
            {order.paymentInfo?.trim() && (
              <>
                <p className="mt-5 text-sm font-semibold">{t("paymentInfo")}</p>
                <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-muted p-4 font-sans text-sm">{order.paymentInfo}</pre>
              </>
            )}
          </div>
        )}

        <Button asChild variant="outline" className="mt-6">
          <Link href={`/${locale}`}>{t("continueShopping")}</Link>
        </Button>
      </div>
    </main>
  );
}
