import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { getErrorPagesConfig } from "@/lib/config";
import { Button } from "@/components/ui/button";

/** 语言内 404(需求 5):标题/描述后台可配(功能设置 → 错误页) */
export default async function LocaleNotFound() {
  const [locale, t, cfg] = await Promise.all([
    getLocale(),
    getTranslations("errors"),
    getErrorPagesConfig().catch(() => null),
  ]);

  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-heading text-6xl font-bold text-primary">{cfg?.notFoundTitle || "404"}</h1>
      <p className="text-muted-foreground">{cfg?.notFoundDesc || "页面不存在或已被移除"}</p>
      <Button asChild variant="outline">
        <Link href={`/${locale}`}>{t("backHome")}</Link>
      </Button>
    </main>
  );
}
