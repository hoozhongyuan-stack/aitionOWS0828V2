import { notFound } from "next/navigation";
import Link from "next/link";
import { setRequestLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { getPublishedBySlug } from "@/server/content";
import { buildAlternates } from "@/lib/seo/alternates";
import { getForm } from "@/server/form";
import { getFeatureFlags } from "@/lib/config";
import { hasFavorited } from "@/server/ugc";
import { getActiveUserSession } from "@/lib/auth/session";
import { sanitizeRichHtml } from "@/lib/sanitize";
import { safeDateLocale } from "@/lib/utils";
import { InteractionBar } from "@/components/site/interaction-bar";
import { CommentsSection } from "@/components/site/comments-section";
import { ViewTracker } from "@/components/site/view-tracker";
import { ArticleJsonLd } from "@/components/seo/json-ld";
import { FormRenderer } from "@/components/site/form-renderer";
import type { FormField } from "@/types/form";
import { Eye, UserRound } from "lucide-react";

/**
 * 内容详情页:/article/[slug](SSR,需求 4.4 / 4.8)
 * - 单页 TDK(需求 4.1):seoTitle/seoKeywords/seoDesc,兜底标题/摘要
 * - 阅读量/点赞/转发展示与互动(开关受后台控制)
 * - 收藏按钮(V3.0 REQ-006):登录态与收藏态服务端注入;未登录点击 → 登录回跳
 * - 评论区:仅展示已审核评论
 */

interface Props {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const content = await getPublishedBySlug(slug, locale);
  if (!content) return {};
  return {
    title: content.seoTitle || content.title,
    alternates: await buildAlternates(`/article/${slug}`, locale),
    description: content.seoDesc || content.summary || undefined,
    keywords: content.seoKeywords || undefined,
    openGraph: {
      title: content.seoTitle || content.title,
      description: content.seoDesc || content.summary || undefined,
      images: content.coverUrl ? [content.coverUrl] : undefined,
      type: "article",
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const [content, features, t, user] = await Promise.all([
    getPublishedBySlug(slug, locale),
    getFeatureFlags(),
    getTranslations("interaction"),
    // 与页头/写接口同口径:被禁用账号即使持有效 JWT 也按未登录对待
    getActiveUserSession(),
  ]);
  if (!content) notFound();

  // 收藏态服务端预取(REQ-006):未登录恒 false,首屏不闪烁
  const favorited = user ? await hasFavorited({ contentId: content.id, userId: user.id }) : false;

  const date = new Date(content.publishedAt);

  // 编辑器「所属表单」挂载:表单已删除或被停用则自动不渲染(应用层一致性)
  const attachedForm = content.formId ? await getForm(content.formId) : null;
  let attachedFields: FormField[] = [];
  if (attachedForm && attachedForm.enabled) {
    try {
      attachedFields = JSON.parse(attachedForm.schema) as FormField[];
    } catch {
      attachedFields = [];
    }
  }

  return (
    <main className="container max-w-3xl py-10">
      {/* 阅读量埋点(客户端一次性触发,防重复) */}
      <ViewTracker contentId={content.id} />
      {/* 结构化数据:文章(需求 4.1) */}
      <ArticleJsonLd
        locale={locale}
        slug={content.slug}
        title={content.title}
        description={content.seoDesc || content.summary || ""}
        cover={content.coverUrl}
        publishedAt={date.toISOString()}
        authorName={content.authorName}
      />

      <nav className="mb-4 text-sm text-muted-foreground" aria-label="面包屑">
        <Link href={`/${locale}/c/${content.category.slug}`} className="hover:text-primary">
          {content.category.name}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{content.title}</span>
      </nav>

      <article>
        <header className="mb-6">
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
              {t("views")} {content.viewCount}
            </span>
          </div>
        </header>

        {content.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={content.coverUrl} alt={content.title} className="mb-6 w-full rounded-xl" />
        )}

        {/* 渲染端兜底消毒:正文可能来自 UGC 投稿,防存储型 XSS */}
        <div
          className="rich-content"
          dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(content.body) }}
        />
      </article>

      {/* 编辑器挂载的获客表单(可选) */}
      {attachedForm && attachedForm.enabled && attachedFields.length > 0 && (
        <section className="mt-8">
          <FormRenderer
            slug={attachedForm.slug}
            title={attachedForm.name}
            fields={attachedFields}
          />
        </section>
      )}

      {/* 互动条(收藏恒展示 REQ-006;点赞/转发受总开关控制,需求 4.8) */}
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

      {/* 评论区(总开关控制) */}
      {features.comment && (
        <CommentsSection contentId={content.id} loginRequired={features.commentLoginRequired} />
      )}
    </main>
  );
}
