import Link from "next/link";
import { setRequestLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { listLatestPublished } from "@/server/content";
import { getActiveBanners } from "@/server/banner";
import { getSeoMetaFor } from "@/server/seo";
import { ContentCard } from "@/components/site/content-card";
import { HeroCarousel } from "@/components/site/hero-carousel";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

/**
 * 前台首页(SSR):
 * - Hero 文案来自多语言文案(后台「语言 → 界面文案覆盖」可按语言自定义,namespace=site,
 *   key=heroTitle/heroSubtitle/heroCta;测试反馈缺陷3 已确认此机制,无需新增配置项)
 * - Hero 背景:配置了轮播图(新增需求①,后台「轮播图」)时展示通屏轮播,否则回退到默认渐变背景
 * - 最新已发布内容(需求 4.4)
 * - 首页 TDK 来自 SeoMeta(pageKey=home,需求 4.1)
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return getSeoMetaFor("home", locale);
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, tCommon, tInter, latest, banners] = await Promise.all([
    getTranslations("site"),
    getTranslations("common"),
    getTranslations("interaction"),
    listLatestPublished(locale, 6),
    getActiveBanners(),
  ]);
  const hasBanners = banners.length > 0;

  return (
    <main>
      {/* Hero:配置了轮播图则通屏轮播背景 + 浅色文字,否则回退默认渐变背景 */}
      <section className={hasBanners ? "relative overflow-hidden border-b" : "border-b bg-gradient-to-b from-secondary/60 to-background"}>
        {hasBanners && (
          <HeroCarousel banners={banners.map((b) => ({ imageUrl: b.imageUrl, linkUrl: b.linkUrl }))} />
        )}
        <div
          className={
            hasBanners
              ? "container pointer-events-none relative z-10 flex flex-col items-center gap-6 py-20 text-center text-white sm:py-28"
              : "container flex flex-col items-center gap-6 py-20 text-center sm:py-28"
          }
        >
          <h1
            className={
              hasBanners
                ? "max-w-3xl font-heading text-4xl font-bold tracking-tight drop-shadow-md sm:text-5xl"
                : "max-w-3xl font-heading text-4xl font-bold tracking-tight sm:text-5xl"
            }
          >
            {t("heroTitle")}
          </h1>
          <p className={hasBanners ? "max-w-xl text-lg text-white/90 drop-shadow-md" : "max-w-xl text-lg text-muted-foreground"}>
            {t("heroSubtitle")}
          </p>
          <Button asChild size="lg" variant={hasBanners ? "secondary" : "default"} className={hasBanners ? "pointer-events-auto" : undefined}>
            <Link href={`/${locale}/contact`}>
              {t("heroCta")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* 最新内容 */}
      <section className="container py-16">
        <div className="mb-8 flex items-center justify-between">
          <h2 className="font-heading text-2xl font-bold">{t("latestNews")}</h2>
        </div>
        {latest.length === 0 ? (
          <div className="rounded-lg border border-dashed p-16 text-center text-muted-foreground">
            {tCommon("empty")}
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {latest.map((item) => (
              <ContentCard key={item.id} locale={locale} item={item} viewsLabel={tInter("views")} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
