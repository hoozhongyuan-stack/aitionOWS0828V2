import { notFound } from "next/navigation";
import Link from "next/link";
import { setRequestLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { getProductDetail } from "@/server/content";
import { hasFavorited } from "@/server/ugc";
import { getActiveUserSession } from "@/lib/auth/session";
import { buildAlternates } from "@/lib/seo/alternates";
import { getBrandConfig, getFeatureFlags } from "@/lib/config";
import { sanitizeRichHtml } from "@/lib/sanitize";
import { safeDateLocale } from "@/lib/utils";
import { ViewTracker } from "@/components/site/view-tracker";
import { InteractionBar } from "@/components/site/interaction-bar";
import { FormRenderer } from "@/components/site/form-renderer";
import { ProductJsonLd } from "@/components/seo/json-ld";
import { GalleryViewer } from "@/components/site/gallery-viewer";
import { Eye, UserRound } from "lucide-react";

/**
 * 商品详情页:/product/[slug](SSR,V3.0 REQ-002 / REQ-004)
 * - 图集(首图大图 + 其余缩略图静态展示,无客户端图库依赖,禁 JS 可见全部图,NFR-002)
 * - 规格参数表(specs 键值对)
 * - 富文本正文(与文章详情同一 sanitize 渲染管线)
 * - 询盘表单:仅当内容关联了启用中的表单时渲染(服务层 getProductDetail 已过滤 enabled,REQ-002 有意差异)
 * - 单页 TDK 沿用 ContentTranslation;Product JSON-LD 结构化数据(REQ-004)
 * - 未发布/不存在走 notFound()(语言内 404 边界,与文章详情一致)
 */

interface Props {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const content = await getProductDetail(slug, locale);
  if (!content) return {};
  const ogImage = content.gallery[0]?.url ?? content.coverUrl;
  return {
    title: content.seoTitle || content.title,
    alternates: await buildAlternates(`/product/${slug}`, locale),
    description: content.seoDesc || content.summary || undefined,
    keywords: content.seoKeywords || undefined,
    openGraph: {
      title: content.seoTitle || content.title,
      description: content.seoDesc || content.summary || undefined,
      images: ogImage ? [ogImage] : undefined,
      type: "website",
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const [content, features, brand, t, tInter, user] = await Promise.all([
    getProductDetail(slug, locale),
    getFeatureFlags(),
    getBrandConfig(),
    getTranslations("product"),
    getTranslations("interaction"),
    getActiveUserSession(),
  ]);
  if (!content) notFound();
  const favorited = user ? await hasFavorited({ contentId: content.id, userId: user.id }) : false;

  const date = new Date(content.publishedAt);
  const images = content.gallery.map((g) => g.url);
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return (
    <main className="container max-w-5xl py-10">
      {/* 阅读量埋点(客户端一次性触发,防重复) */}
      <ViewTracker contentId={content.id} />
      {/* 结构化数据:商品(REQ-004;brand=品牌站点名,specs 含「型号」时输出 sku) */}
      <ProductJsonLd
        name={content.title}
        description={content.seoDesc || content.summary || ""}
        image={images.length > 0 ? images : content.coverUrl}
        url={`${base}/${locale}/product/${content.slug}`}
        category={content.category.name}
        brand={brand.siteName}
        specs={content.specs}
      />

      <nav className="mb-4 text-sm text-muted-foreground" aria-label="面包屑">
        <Link href={`/${locale}/c/${content.category.slug}`} className="hover:text-primary">
          {content.category.name}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{content.title}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* 图集:主图 + 缩略图点击切换(客户端零依赖;SSR 输出全部图,禁 JS 仍可见,NFR-002) */}
        <section aria-label={t("gallery")}>
          <GalleryViewer
            images={images.map((u, i) => ({ url: u, alt: `${content.title} ${i + 1}` }))}
            alt={content.title}
          />
        </section>

        <section>
          <h1 className="font-heading text-3xl font-bold leading-tight">{content.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {content.authorName && (
              <span className="inline-flex items-center gap-1">
                <UserRound className="h-4 w-4" />
                {content.authorName}
              </span>
            )}
            <time dateTime={date.toISOString()}>{date.toLocaleDateString(safeDateLocale(locale))}</time>
            <span className="inline-flex items-center gap-1">
              <Eye className="h-4 w-4" />
              {tInter("views")} {content.viewCount}
            </span>
          </div>

          {content.summary && <p className="mt-4 text-muted-foreground">{content.summary}</p>}

          {/* 规格参数表(REQ-002) */}
          {content.specs.length > 0 && (
            <div className="mt-6">
              <h2 className="font-heading text-xl font-semibold">{t("specs")}</h2>
              <table className="mt-3 w-full border-collapse overflow-hidden rounded-lg text-sm">
                <tbody>
                  {content.specs.map((s, i) => (
                    <tr key={`${s.k}-${i}`} className="border-b bg-card last:border-b-0">
                      <th scope="row" className="w-36 px-4 py-2.5 text-left font-medium text-muted-foreground">
                        {s.k}
                      </th>
                      <td className="px-4 py-2.5">{s.v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* 富文本正文(渲染端兜底消毒,与文章详情同一管线) */}
      <article className="mt-10">
        <div
          className="rich-content"
          dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(content.body) }}
        />
      </article>

      {/* 询盘表单(REQ-002):关联表单且启用中才渲染;表单名由后台配置(询盘语境) */}
      {content.inquiryForm && content.inquiryForm.fields.length > 0 && (
        <section className="mx-auto mt-12 max-w-2xl" aria-label={t("inquiry")}>
          <FormRenderer
            slug={content.inquiryForm.slug}
            title={content.inquiryForm.name}
            fields={content.inquiryForm.fields}
          />
        </section>
      )}

      {/* 互动条(收藏恒展示 REQ-006;点赞/转发受总开关控制,与文章详情一致) */}
      <InteractionBar
        contentId={content.id}
        likeCount={content.likeCount}
        shareCount={content.shareCount}
        showLike={features.like}
        showShare={features.share}
        showFavorite
        initialFavorited={favorited}
        authed={!!user}
      />
    </main>
  );
}
