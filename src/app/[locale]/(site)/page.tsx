import Link from "next/link";
import { setRequestLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { listLatestPublished } from "@/server/content";
import { getHomeLayout, getHomeFloorSections, type HomeFloorSection } from "@/server/layout";
import { getActiveBanners } from "@/server/banner";
import { getSeoMetaFor } from "@/server/seo";
import { getBrandConfig } from "@/lib/config";
import { buildOpenGraph, resolveMetadataTitle } from "@/lib/seo/open-graph";
import { ContentCard } from "@/components/site/content-card";
import { Parallax, Reveal } from "@/components/site/aurora-motion";
import { WineFx } from "@/components/site/wine-fx";
import { ListItemRow } from "@/components/site/layout-presets";
import { HeroCarousel } from "@/components/site/hero-carousel";
import { Button } from "@/components/ui/button";
import { ArrowRight, ChevronDown } from "lucide-react";

/**
 * 前台首页(SSR · V3.2 布局预设 · V3.3 楼层 · V4.2.1 spotlight):
 * - preset=grid(现状默认):轮播 Hero → 最新动态网格
 * - preset=hero-list:全宽 Hero → 最新动态列表条目 → CTA 横幅
 * - preset=split:左右分屏 Hero → 最新动态网格
 * - preset=spotlight(V4.2.1):全幅首屏(撑满一屏,扣除 sticky 页头) → 超大标题 + 双 CTA + 滚动提示
 * - 楼层(V3.3 D):最新动态之后按后台配置逐层渲染(绑定栏目,grid3/list/feature 三样式);
 *   未配置楼层=现状布局零变化;楼层引用已删栏目或栏目无内容时该层自然跳过
 * - 布局由后台「站点配置 → 页面布局」选择(Setting group=layout);缺省 grid,升级零变化
 * - 区块显隐(轮播/最新动态)由后台配置(sections);双主题自动适配(classic/aurora)
 * - Hero 文案来自多语言文案;分享 OG 同源(V3.1 REQ-003)
 */

type FloorCard = HomeFloorSection["items"][number];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const [meta, banners, brand] = await Promise.all([
    getSeoMetaFor("home", locale),
    getActiveBanners(),
    getBrandConfig(),
  ]);
  return {
    ...meta,
    openGraph: await buildOpenGraph({
      title: resolveMetadataTitle(meta.title, brand.siteName),
      description: meta.description,
      imagePath: banners[0]?.imageUrl,
      locale,
    }),
  };
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, tCommon, tInter, latest, banners, homeLayout, floorSections] = await Promise.all([
    getTranslations("site"),
    getTranslations("common"),
    getTranslations("interaction"),
    listLatestPublished(locale, 6),
    getActiveBanners(),
    getHomeLayout(),
    getHomeFloorSections(locale),
  ]);
  const hasBanners = homeLayout.sections.banners && banners.length > 0;
  const showLatest = homeLayout.sections.latest;
  const preset = homeLayout.preset;

  // —— 通用 Hero 文案(grid 与 split 共用;hero-list 用居中变体) ——
  const heroCopy = (
    <>
      <h1 className="aurora-rise max-w-3xl font-heading text-4xl font-bold tracking-tight sm:text-5xl">
        {t("heroTitle")}
      </h1>
      <p className="aurora-rise max-w-xl text-lg text-muted-foreground">{t("heroSubtitle")}</p>
      <Button asChild size="lg" className="aurora-rise aurora-delay-2">
        <Link href={`/${locale}/contact`}>
          {t("heroCta")}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </>
  );

  // —— 最新动态网格(grid/split 共用) ——
  const latestGrid = (
    <Reveal>
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
            <ContentCard key={item.id} locale={locale} item={item} viewsLabel={tInter("views")} moduleType={item.moduleType} />
          ))}
        </div>
      )}
    </Reveal>
  );

  // —— 楼层区块(V3.3 D):三种预设共用,插在最新动态之后 ——
  const floorBlocks =
    floorSections.length > 0 ? (
      <>
        {floorSections.map((fs) => (
          <FloorSection
            key={fs.floor.categoryId}
            data={fs}
            locale={locale}
            readMoreLabel={tCommon("readMore")}
            viewsLabel={tInter("views")}
          />
        ))}
      </>
    ) : null;

  return (
    <main>
      {preset === "hero-list" && (
        <>
          {/* hero-list:全宽 Hero(首条 Banner 作背景) */}
          <section className="aurora-hero relative overflow-hidden border-b">
            <WineFx />
            {hasBanners && (
              <HeroCarousel banners={banners.map((b) => ({ imageUrl: b.imageUrl, linkUrl: b.linkUrl }))} />
            )}
            <Parallax speed={0.25}>
              <div
                className={
                  hasBanners
                    ? "container pointer-events-none relative z-10 flex flex-col items-center gap-6 py-24 text-center text-white sm:py-32"
                    : "container flex flex-col items-center gap-6 py-24 text-center sm:py-32"
                }
              >
                <h1
                  className={
                    hasBanners
                      ? "aurora-rise max-w-3xl font-heading text-4xl font-bold tracking-tight drop-shadow-md sm:text-5xl"
                      : "aurora-rise max-w-3xl font-heading text-4xl font-bold tracking-tight sm:text-5xl"
                  }
                >
                  {t("heroTitle")}
                </h1>
                <p className={(hasBanners ? "max-w-xl text-lg text-white/90 drop-shadow-md" : "max-w-xl text-lg text-muted-foreground") + " aurora-rise"}>
                  {t("heroSubtitle")}
                </p>
                <Button asChild size="lg" variant={hasBanners ? "secondary" : "default"} className={(hasBanners ? "pointer-events-auto" : "") + " aurora-rise aurora-delay-2"}>
                  <Link href={`/${locale}/contact`}>
                    {t("heroCta")}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </Parallax>
          </section>

          {showLatest && latest.length > 0 && (
            <section className="container py-16">
              <Reveal>
                <h2 className="mb-6 font-heading text-2xl font-bold">{t("latestNews")}</h2>
                <div className="space-y-3">
                  {latest.map((item) => (
                    <ListItemRow
                      key={item.id}
                      item={{
                        slug: item.slug,
                        title: item.title,
                        summary: item.summary,
                        coverUrl: item.coverUrl,
                        publishedAt: item.publishedAt,
                        authorName: item.authorName,
                        href: item.moduleType === "product" ? `/${locale}/product/${item.slug}` : `/${locale}/article/${item.slug}`,
                      }}
                      dateLabel={tInter("views")}
                    />
                  ))}
                </div>
              </Reveal>
            </section>
          )}

          {floorBlocks}

          {/* CTA 横幅(hero-list 尾部) */}
          <section className="container pb-16">
            <Reveal>
              <div className="flex flex-col items-center justify-between gap-4 rounded-xl border bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-8 sm:flex-row">
                <p className="text-lg font-medium">{tCommon("contactUs") ?? t("heroCta")}</p>
                <Button asChild>
                  <Link href={`/${locale}/contact`}>
                    {t("heroCta")}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </Reveal>
          </section>
        </>
      )}

      {preset === "split" && (
        <>
          {/* split:左右分屏 Hero(左文右图) */}
          <section className="aurora-hero relative border-b">
            <WineFx />
            <div className="container grid items-center gap-8 py-16 lg:grid-cols-2 lg:py-24">
              <Parallax speed={0.2}>
                <div className="flex flex-col items-start gap-6">{heroCopy}</div>
              </Parallax>
              {hasBanners && banners[0]?.imageUrl && (
                <Reveal delay={150}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={banners[0].imageUrl}
                    alt={t("heroTitle")}
                    className="aspect-[4/3] w-full rounded-2xl border object-cover shadow-2xl"
                  />
                </Reveal>
              )}
            </div>
          </section>
          {showLatest && latestGrid}
          {floorBlocks}
        </>
      )}

      {preset === "spotlight" && (
        <>
          {/* spotlight(V4.2.1):全幅首屏——撑满一屏(扣除 sticky 页头 h-16=4rem) + 超大标题 + 双 CTA + 滚动提示 */}
          <section
            className={
              "aurora-hero relative flex min-h-[calc(100svh_-_4rem)] items-center overflow-hidden border-b" +
              (hasBanners ? "" : " bg-gradient-to-b from-secondary/60 to-background")
            }
          >
            <WineFx />
            {hasBanners && (
              <HeroCarousel banners={banners.map((b) => ({ imageUrl: b.imageUrl, linkUrl: b.linkUrl }))} />
            )}
            <Parallax speed={0.2} className="w-full">
              <div
                className={
                  hasBanners
                    ? "container pointer-events-none relative z-10 flex flex-col items-center gap-6 py-20 text-center text-white"
                    : "container relative z-10 flex flex-col items-center gap-6 py-20 text-center"
                }
              >
                <h1
                  className={
                    "aurora-rise max-w-4xl font-heading text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl xl:text-7xl" +
                    (hasBanners ? " drop-shadow-md" : "")
                  }
                >
                  {t("heroTitle")}
                </h1>
                <p
                  className={
                    "aurora-rise max-w-2xl text-lg sm:text-xl" +
                    (hasBanners ? " text-white/90 drop-shadow-md" : " text-muted-foreground")
                  }
                >
                  {t("heroSubtitle")}
                </p>
                <div className="flex flex-col items-center gap-3 sm:flex-row">
                  <Button
                    asChild
                    size="lg"
                    variant={hasBanners ? "secondary" : "default"}
                    className={hasBanners ? "pointer-events-auto aurora-rise aurora-delay-2" : "aurora-rise aurora-delay-2"}
                  >
                    <Link href={`/${locale}/contact`}>
                      {t("heroCta")}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className={
                      (hasBanners
                        ? "pointer-events-auto border-white/60 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                        : "") + " aurora-rise aurora-delay-2"
                    }
                  >
                    <a href="#latest">
                      {t("heroCtaSecondary")}
                      <ChevronDown className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </div>
            </Parallax>
            {/* 滚动提示(无最新动态区块时无锚点可去,隐藏);bottom-10 让开轮播圆点(bottom-4) */}
            {showLatest && latest.length > 0 && (
              <a
                href="#latest"
                aria-label={t("heroCtaSecondary")}
                className={
                  "absolute bottom-10 left-1/2 z-10 -translate-x-1/2 transition-colors " +
                  (hasBanners ? "text-white/75 hover:text-white" : "text-muted-foreground hover:text-foreground")
                }
              >
                <ChevronDown className="h-6 w-6 motion-safe:animate-bounce" />
              </a>
            )}
          </section>

          {showLatest && <div id="latest">{latestGrid}</div>}
          {floorBlocks}
        </>
      )}

      {preset === "grid" && (
        <>
          {/* grid(现状默认):轮播 Hero + 最新动态网格 */}
          <section className={`aurora-hero relative ${hasBanners ? "overflow-hidden border-b" : "border-b bg-gradient-to-b from-secondary/60 to-background"}`}>
            <WineFx />
            {hasBanners && (
              <HeroCarousel banners={banners.map((b) => ({ imageUrl: b.imageUrl, linkUrl: b.linkUrl }))} />
            )}
            <Parallax speed={0.25}>
              <div
                className={
                  hasBanners
                    ? "container pointer-events-none relative z-10 flex flex-col items-center gap-6 py-20 text-center text-white sm:py-28"
                    : "container flex flex-col items-center gap-6 py-20 text-center sm:py-28"
                }
              >
                {heroCopy}
              </div>
            </Parallax>
          </section>
          {showLatest && latestGrid}
          {floorBlocks}
        </>
      )}
    </main>
  );
}

/** 首页楼层区块(V3.3 D):层标题(可覆盖) + 查看更多 → 栏目页 + 三种楼层样式 */
function FloorSection({
  data,
  locale,
  readMoreLabel,
  viewsLabel,
}: {
  data: HomeFloorSection;
  locale: string;
  readMoreLabel: string;
  viewsLabel: string;
}) {
  const { floor, slug, name, moduleType, items } = data;
  const hrefOf = (item: FloorCard) =>
    item.moduleType === "product" ? `/${locale}/product/${item.slug}` : `/${locale}/article/${item.slug}`;
  return (
    <section className="container py-12">
      <Reveal>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-heading text-2xl font-bold">{floor.title ?? name}</h2>
          <Link
            href={`/${locale}/c/${slug}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            {readMoreLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {floor.style === "list" && (
          <div className="space-y-3">
            {items.map((item) => (
              <ListItemRow
                key={item.id}
                item={{
                  slug: item.slug,
                  title: item.title,
                  summary: item.summary,
                  coverUrl: item.coverUrl,
                  publishedAt: item.publishedAt,
                  authorName: item.authorName,
                  href: hrefOf(item),
                }}
                dateLabel={viewsLabel}
              />
            ))}
          </div>
        )}
        {floor.style === "feature" && (
          <div className="space-y-6">
            <ContentCard locale={locale} item={items[0]} viewsLabel={viewsLabel} moduleType={moduleType} featured />
            {items.length > 1 && (
              <div className="grid gap-6 sm:grid-cols-2">
                {items.slice(1).map((item) => (
                  <ContentCard key={item.id} locale={locale} item={item} viewsLabel={viewsLabel} moduleType={moduleType} />
                ))}
              </div>
            )}
          </div>
        )}
        {floor.style === "grid3" && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <ContentCard key={item.id} locale={locale} item={item} viewsLabel={viewsLabel} moduleType={moduleType} />
            ))}
          </div>
        )}
      </Reveal>
    </section>
  );
}
