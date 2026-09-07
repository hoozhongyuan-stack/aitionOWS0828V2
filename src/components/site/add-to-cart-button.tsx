"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Check, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoginDialog } from "@/components/site/login-dialog";
import { addToCart } from "@/lib/cart-store";

/**
 * 加购按钮(V4.0;V4.0.1 登录墙):未登录先弹登录弹窗,登录成功自动完成加购;
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
  const [loginOpen, setLoginOpen] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null); // null=未检查

  function attemptAdd() {
    addToCart({ contentId, slug, title, priceCents, currency, coverUrl });
    setAdded(true);
  }

  async function handleClick() {
    // 登录态检查(缓存结果,重复点击不再请求)
    let ok = authed;
    if (ok === null) {
      try {
        const r = await fetch("/api/auth/me");
        const d = await r.json();
        ok = !!(d.ok && d.data);
      } catch {
        ok = false;
      }
      setAuthed(!!ok);
    }
    if (ok) {
      attemptAdd();
    } else {
      setLoginOpen(true); // 登录成功后 onLoggedIn 内自动继续加购
    }
  }

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
    <>
      <Button size="lg" onClick={handleClick}>
        <ShoppingCart className="mr-2 h-4 w-4" />
        {t("addToCart")}
      </Button>
      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} onLoggedIn={attemptAdd} />
    </>
  );
}
