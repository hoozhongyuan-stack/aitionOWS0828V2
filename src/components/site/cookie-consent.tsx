"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { safeDateLocale } from "@/lib/utils";

/**
 * Cookie 同意条幅(V4.0 · GDPR):首次访问底部展示,选择后写入 localStorage 不再弹出。
 * 站点当前无第三方追踪脚本,「仅必要」与「全部接受」行为一致(记录选择本身),
 * 为将来 GA/Meta Pixel 等分项管理预留 consent 状态(读 key 即可)。
 */
const KEY = "aition_cookie_consent";

export function CookieConsent() {
  const t = useTranslations("shop");
  const pathname = usePathname();
  const locale = safeDateLocale(pathname.split("/")[1]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(KEY)) setVisible(true);
    } catch {
      /* 隐私模式:不弹 */
    }
  }, []);

  function choose(value: "all" | "necessary") {
    try {
      window.localStorage.setItem(KEY, value);
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <p className="flex-1 text-sm text-muted-foreground">
          {t("cookieText")}{" "}
          <Link href={`/${locale}/agreement/privacy`} className="underline hover:text-primary">
            {t("privacyPolicy")}
          </Link>
          {" / "}
          <Link href={`/${locale}/agreement/cookies`} className="underline hover:text-primary">
            {t("cookiePolicy")}
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" onClick={() => choose("all")}>
            {t("cookieAccept")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => choose("necessary")}>
            {t("cookieNecessary")}
          </Button>
        </div>
      </div>
    </div>
  );
}
