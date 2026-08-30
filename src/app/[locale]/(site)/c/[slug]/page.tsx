import { notFound } from "next/navigation";
import Link from "next/link";
import { setRequestLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { listPublishedByCategory, listCategories } from "@/server/content";
import { buildAlternates } from "@/lib/seo/alternates";
import { getFormByRelatedKey } from "@/server/form";
import { getFeatureFlags } from "@/lib/config";
import { ContentCard } from "@/components/site/content-card";
import { FormRenderer } from "@/components/site/form-renderer";
import { Button } from "@/components/ui/button";
import { ChevronLeft, PenLine } from "lucide-react";

/**
 * 栏目页:/c/[slug]?page=N(SSR,需求 4.4)
 * TDK 来自栏目翻译(名称/描述),需求 4.1 单页 TDK。
 *
 * V3.0 商品栏目(REQ-003,moduleType=product):
 * - 父栏目页:子分类页签(「全部」聚合本树商品)+ 各子栏目页签
 * - 子栏目页:父分类返回链接 + 兄弟分类导航
 * - 商品图卡网格(封面,无封面用现有卡片占位),详情链接分流 /product/[slug]
 * - 分页沿用既有导航;非 product 栏目渲染路径保持不变
 */

interface Props {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const data = await listPublishedByCategory(slug, locale, 1, 1);
  if (!data) return {};
  return {
    title: data.category.name,
    alternates: await buildAlternates(`/c/${slug}`, locale),
    description: data.category.description ?? undefined,
  };
}

/** 栏目翻译名:指定语言 → 首条翻译 → slug(与导航/列表兜底口径一致) */
function nameOf(
  locale: string,
  c: { slug: string; translations: { locale: string; name: string }[] }
): string {
  return c.translations.find((tr) => tr.locale === locale)?.name ?? c.translations[0]?.name ?? c.slug;
}

const tabClass = (active: boolean) =>
  active
    ? "rounded-full bg-primary px-4 py-1.5 text-sm text-primary-foreground"
    : "rounded-full border px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

export default async function CategoryPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  const { page: pageRaw } = await searchParams;
  setRequestLocale(locale);

  const page = Math.max(1, Number(pageRaw) || 1);
  const data = await listPublishedByCategory(slug, locale, page);
  if (!data) notFound();

  const t = await getTranslations("common");
  const tInter = await getTranslations("interaction");
  const tSubmission = await getTranslations("submission");
  const tProduct = await getTranslations("product");
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  // 场景化获客:关联标识 = 栏目标识的表单展示在列表下方(需求 4.5)
  const relatedForm = await getFormByRelatedKey(slug);
  // 用户投稿入口(需求 4.8):全局开关 + 栏目允许投稿 时才展示(测试反馈缺陷7)
  const features = await getFeatureFlags();
  const showSubmitEntry = features.submission && data.category.allowSubmit;

  // 商品栏目:子栏目页需要父分类与兄弟分类导航(经栏目树服务层获取,不直连 Prisma)
  const isProduct = data.category.moduleType === "product";
  let parentCategory: { slug: string; name: string } | null = null;
  let siblingCategories: { slug: string; name: string }[] = [];
  if (isProduct) {
    const cats = await listCategories();
    const current = cats.find((c) => c.slug === slug);
    if (current?.parentId) {
      const parent = cats.find((c) => c.id === current.parentId && c.visible);
      if (parent) {
        parentCategory = { slug: parent.slug, name: nameOf(locale, parent) };
        siblingCategories = cats
          .filter((c) => c.parentId === parent.id && c.visible)
          .map((c) => ({ slug: c.slug, name: nameOf(locale, c) }));
      }
    }
  }

  return (
    <main className="container py-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold">{data.category.name}</h1>
          {data.category.description && (
            <p className="mt-2 text-muted-foreground">{data.category.description}</p>
          )}
        </div>
        {showSubmitEntry && (
          <Button asChild>
            <Link href={`/${locale}/submit`}>
              <PenLine className="h-4 w-4" />
              {tSubmission("title")}
            </Link>
          </Button>
        )}
      </header>

      {/* 商品父栏目页:子分类页签(全部 = 聚合本栏目树商品) */}
      {isProduct && !parentCategory && data.category.children.length > 0 && (
        <nav className="mb-8 flex flex-wrap gap-2" aria-label={tProduct("subCategories")}>
          <Link
            href={`/${locale}/c/${slug}`}
            className={tabClass(true)}
            aria-current="page"
          >
            {t("all")}
          </Link>
          {data.category.children.map((ch) => (
            <Link key={ch.slug} href={`/${locale}/c/${ch.slug}`} className={tabClass(false)}>
              {ch.name}
            </Link>
          ))}
        </nav>
      )}

      {/* 商品子栏目页:父分类返回链接 + 兄弟分类导航 */}
      {isProduct && parentCategory && (
        <div className="mb-8">
          <Link
            href={`/${locale}/c/${parentCategory.slug}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            <ChevronLeft className="h-4 w-4" />
            {parentCategory.name}
          </Link>
          {siblingCategories.length > 1 && (
            <nav className="mt-3 flex flex-wrap gap-2" aria-label={tProduct("subCategories")}>
              {siblingCategories.map((s) => (
                <Link
                  key={s.slug}
                  href={`/${locale}/c/${s.slug}`}
                  className={tabClass(s.slug === slug)}
                  aria-current={s.slug === slug ? "page" : undefined}
                >
                  {s.name}
                </Link>
              ))}
            </nav>
          )}
        </div>
      )}

      {data.items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-16 text-center text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((item) => (
            <ContentCard
              key={item.id}
              locale={locale}
              item={item}
              viewsLabel={tInter("views")}
              moduleType={isProduct ? "product" : undefined}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav className="mt-10 flex items-center justify-center gap-2" aria-label="分页">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/${locale}/c/${slug}?page=${p}`}
              className={
                p === page
                  ? "rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
                  : "rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
              }
            >
              {p}
            </Link>
          ))}
        </nav>
      )}

      {relatedForm && (
        <section className="mx-auto mt-14 max-w-2xl">
          <FormRenderer
            slug={relatedForm.slug}
            title={relatedForm.name}
            fields={relatedForm.fields}
          />
        </section>
      )}
    </main>
  );
}
