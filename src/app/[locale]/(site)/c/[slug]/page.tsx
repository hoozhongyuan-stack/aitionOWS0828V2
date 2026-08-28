import { notFound } from "next/navigation";
import Link from "next/link";
import { setRequestLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { listPublishedByCategory } from "@/server/content";
import { buildAlternates } from "@/lib/seo/alternates";
import { getFormByRelatedKey } from "@/server/form";
import { getFeatureFlags } from "@/lib/config";
import { ContentCard } from "@/components/site/content-card";
import { FormRenderer } from "@/components/site/form-renderer";
import { Button } from "@/components/ui/button";
import { PenLine } from "lucide-react";

/**
 * 栏目页:/c/[slug]?page=N(SSR,需求 4.4)
 * TDK 来自栏目翻译(名称/描述),需求 4.1 单页 TDK。
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
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  // 场景化获客:关联标识 = 栏目标识的表单展示在列表下方(需求 4.5)
  const relatedForm = await getFormByRelatedKey(slug);
  // 用户投稿入口(需求 4.8):全局开关 + 栏目允许投稿 时才展示(测试反馈缺陷7)
  const features = await getFeatureFlags();
  const showSubmitEntry = features.submission && data.category.allowSubmit;

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

      {data.items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-16 text-center text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((item) => (
            <ContentCard key={item.id} locale={locale} item={item} viewsLabel={tInter("views")} />
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
