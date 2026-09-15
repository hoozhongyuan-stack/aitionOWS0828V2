import { notFound } from "next/navigation";
import Link from "next/link";
import { setRequestLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { getPublishedBySlug } from "@/server/content";
import { buildAlternates } from "@/lib/seo/alternates";
import { buildOpenGraph } from "@/lib/seo/open-graph";
import { getForm } from "@/server/form";
import { getFeatureFlags } from "@/lib/config";
import { hasFavorited } from "@/server/ugc";
import { getActiveUserSession, getGuardedAdmin } from "@/lib/auth/session";
import { sanitizeRichHtml } from "@/lib/sanitize";
import { safeDateLocale } from "@/lib/utils";
import { parseKeywords } from "@/lib/keywords";
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
  /** V4.3.0 前台预览：?preview=1 时对已登录管理员放行未发布内容 */
  searchParams: Promise<{ preview?: string }>;
}

/** 预览鉴权：仅已登录且状态正常的管理员（未登录/账号被禁用一律 false） */
async function canPreview(): Promise<boolean> {
  return Boolean(await getGuardedAdmin());
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const preview = (await searchParams)?.preview === "1" ? await canPreview() : false;
  const content = await getPublishedBySlug(slug, locale, { allowUnpublished: preview });
  if (!content) return {};
  const title = content.seoTitle || content.title;
  const description = content.seoDesc || content.summary || undefined;
  return {
    title,
    alternates: await buildAlternates(`/article/${slug}`, locale),
    description,
    keywords: content.seoKeywords || undefined,
    // V4.3.0 预览页不得被搜索引擎/AI 引擎收录（草稿内容不对外）
    ...(preview ? { robots: { index: false, follow: false } } : {}),
    // V3.1 REQ-004:OG 语义不变,统一走 buildOpenGraph 绝对化;无封面兜底 LOGO
    openGraph: {
      ...(await buildOpenGraph({ title, description, imagePath: content.coverUrl, locale })),
      type: "article",
    },
  };
}

export default async function ArticlePage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const previewAllowed = (await searchParams)?.preview === "1" ? await canPreview() : false;

  const [content, features, t, tArticle, user] = await Promise.all([
    getPublishedBySlug(slug, locale, { allowUnpublished: previewAllowed }),
    getFeatureFlags(),
    getTranslations("interaction"),
    getTranslations("article"),
    // 与页头/写接口同口径:被禁用账号即使持有效 JWT 也按未登录对待
    getActiveUserSession(),
  ]);
  if (!content) notFound();

  // 收藏态服务端预取(REQ-006):未登录恒 false,首屏不闪烁
  const favorited = user ? await hasFavorited({ contentId: content.id, userId: user.id }) : false;

  const date = new Date(content.publishedAt);
  // 关键词(V4.7.0):此前只进了 meta,访客在页面上看不到
  const keywords = parseKeywords(content.seoKeywords);

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
    <main className="container max-w-4xl py-10">
      {/* V4.7.0:正文列由 max-w-3xl 放宽到 max-w-4xl —— 15px 根字号下 720px→840px */}
      {/* V4.3.0 预览提示：明确告知内容未发布、不对外可见 */}
      {previewAllowed && (
        <div className="mb-6 rounded-lg border border-dashed border-amber-500/60 bg-amber-500/10 px-4 py-2 text-sm">
          预览模式：此内容尚未发布，仅管理员可见（不会被搜索引擎或 AI 引擎收录）
        </div>
      )}
      {/* 阅读量埋点(客户端一次性触发,防重复) */}
      <ViewTracker contentId={content.id} />
      {/* 结构化数据:文章(需求 4.1) */}
      <ArticleJsonLd
        locale={locale}
        slug={content.slug}
        title={content.title}
        description={content.summary || content.seoDesc || ""}
        keywords={keywords}
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

        {/* 封面与正文同宽(V4.7.1):V4.7.0 曾让封面/正文图片出血到约 1080px,视觉上比文字宽,
            与"内容对齐"的预期相反,故取消出血,统一按正文列宽度呈现 */}
        {content.coverUrl && (
          <div className="mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={content.coverUrl} alt={content.title} className="w-full rounded-xl" />
          </div>
        )}

        {/* 导语块(V4.7.0):摘要在详情页的落地位置——封面之后、正文之前,左侧品牌色竖线
            与正文区分;摘要为空时整块不渲染。此前摘要只用于列表卡片 */}
        {content.summary && (
          <p className="mb-6 border-l-[3px] border-primary/60 pl-4 text-base leading-[1.9] text-muted-foreground">
            {content.summary}
          </p>
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

      {/* 关键词标签组(V4.7.0):元信息放页尾不打断阅读;当前站点无搜索页,故不做跳转 */}
      {keywords.length > 0 && (
        <section className="mt-8 border-t pt-4" aria-label={tArticle("keywords")}>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{tArticle("keywords")}</span>
            {keywords.map((k) => (
              // V4.7.2:关键词可点 → 跳到站内搜索,让"关键词"从纯展示变成可探索入口
              <Link
                key={k}
                href={`/${locale}/search?q=${encodeURIComponent(k)}`}
                className="rounded-full border px-2.5 py-0.5 transition-colors hover:border-primary hover:text-primary"
              >
                {k}
              </Link>
            ))}
          </div>
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
