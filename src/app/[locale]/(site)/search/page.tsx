import type { Metadata } from "next";
import Link from "next/link";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Search as SearchIcon } from "lucide-react";
import { searchPublished, getPopularKeywords, resolveContentDetailPath, type SearchHit } from "@/server/content";
import { buildAlternates } from "@/lib/seo/alternates";
import { safeDateLocale } from "@/lib/utils";
import { highlightText } from "@/lib/highlight";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * 站内搜索(V4.7.2)。
 *
 * - 服务端渲染、URL 驱动(`?q=&type=&page=`,链接可分享/可回退),与栏目页筛选同一风格
 * - 匹配范围:标题 / 摘要 / 栏目名(全文搜索有意不做,见服务层注释)
 * - 类型分组:`type=all` 时文章与商品各出一组预览,「查看全部」进入该类型的完整列表(带分页)
 * - 命中高亮:按 React 切片渲染(src/lib/highlight),不拼 HTML
 * - noindex:搜索结果是薄内容,不值得被搜索引擎收录(但保留 follow)
 */

const PAGE_SIZE = 12;
const GROUP_PREVIEW = 6;
type SearchType = "all" | "article" | "product";

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; type?: string; page?: string }>;
}

function parseType(raw?: string): SearchType {
  return raw === "article" || raw === "product" ? raw : "all";
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params;
  const q = ((await searchParams).q ?? "").trim();
  const t = await getTranslations("search");
  return {
    title: q ? `${q} · ${t("title")}` : t("title"),
    // 搜索页不索引(薄内容);follow 保留,便于爬虫沿着结果页继续发现内容
    robots: { index: false, follow: true },
    alternates: await buildAlternates("/search", locale),
  };
}

/** 单条搜索结果(封面 + 类型/栏目 + 高亮标题与摘要 + 作者/时间) */
function ResultRow({
  item,
  q,
  locale,
  typeLabel,
}: {
  item: SearchHit;
  q: string;
  locale: string;
  typeLabel: string;
}) {
  const date = new Date(item.publishedAt);
  return (
    <Link
      href={resolveContentDetailPath(item.moduleType, item.slug, locale)}
      className="group flex gap-4 rounded-xl border bg-card p-4 transition-shadow hover:shadow-md"
    >
      {item.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.coverUrl}
          alt={item.title}
          loading="lazy"
          className="h-20 w-28 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="h-20 w-28 shrink-0 rounded-lg bg-muted" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <Badge variant={item.moduleType === "product" ? "default" : "outline"}>{typeLabel}</Badge>
          {item.categoryName && (
            <span className="truncate text-xs text-muted-foreground">{item.categoryName}</span>
          )}
        </div>
        <h3 className="line-clamp-2 font-heading font-semibold group-hover:text-primary">
          {highlightText(item.title, q)}
        </h3>
        {item.summary && (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{highlightText(item.summary, q)}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {item.authorName && <span className="max-w-32 truncate">{item.authorName}</span>}
          <time dateTime={date.toISOString()}>{date.toLocaleDateString(safeDateLocale(locale))}</time>
        </div>
      </div>
    </Link>
  );
}

export default async function SearchPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const type = parseType(sp.type);
  const page = Math.max(1, Number(sp.page) || 1);

  const t = await getTranslations("search");
  const popular = await getPopularKeywords(locale);
  const typeLabelOf = (m: string) => (m === "product" ? t("product") : t("article"));

  // type=all → 两类各取一页预览;选定类型 → 该类完整列表(带分页)
  const articleRes =
    q && type !== "product"
      ? await searchPublished(locale, q, {
          type: "article",
          page: type === "article" ? page : 1,
          pageSize: type === "article" ? PAGE_SIZE : GROUP_PREVIEW,
        })
      : null;
  const productRes =
    q && type !== "article"
      ? await searchPublished(locale, q, {
          type: "product",
          page: type === "product" ? page : 1,
          pageSize: type === "product" ? PAGE_SIZE : GROUP_PREVIEW,
        })
      : null;

  const total = (articleRes?.total ?? 0) + (productRes?.total ?? 0);
  const activeRes = type === "product" ? productRes : type === "article" ? articleRes : null;
  const totalPages = activeRes ? Math.max(1, Math.ceil(activeRes.total / activeRes.pageSize)) : 1;

  /** 类型切换 Tab(保留关键词,分页回到第 1 页) */
  const tabHref = (k: SearchType) => {
    const p = new URLSearchParams({ q });
    if (k !== "all") p.set("type", k);
    return `/${locale}/search?${p.toString()}`;
  };

  const tabs: [SearchType, string, number][] = [
    ["all", t("all"), (articleRes?.total ?? 0) + (productRes?.total ?? 0)],
    ["article", t("article"), articleRes?.total ?? 0],
    ["product", t("product"), productRes?.total ?? 0],
  ];

  const emptyState = (
    <div className="rounded-xl border border-dashed p-10 text-center">
      <p className="text-sm text-muted-foreground">{q ? t("empty") : t("noQuery")}</p>
      {popular.length > 0 && (
        <>
          <p className="mt-4 text-sm text-muted-foreground">{t("emptyHint")}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {popular.map((k) => (
              <Link
                key={k}
                href={`/${locale}/search?q=${encodeURIComponent(k)}`}
                className="rounded-full border px-3 py-1 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                {k}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const group = (title: string, hitType: SearchType, res: typeof articleRes) =>
    res && res.items.length > 0 ? (
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-heading text-lg font-semibold">
            {title}
            <span className="ml-2 text-sm font-normal text-muted-foreground">{t("count", { n: res.total })}</span>
          </h2>
          {res.total > res.items.length && (
            <Link href={tabHref(hitType)} className="text-sm text-primary underline-offset-2 hover:underline">
              {t("viewAll")} →
            </Link>
          )}
        </div>
        <div className="space-y-3">
          {res.items.map((item) => (
            <ResultRow key={item.id} item={item} q={q} locale={locale} typeLabel={typeLabelOf(item.moduleType)} />
          ))}
        </div>
      </section>
    ) : null;

  return (
    <main className="container max-w-4xl py-10">
      <h1 className="font-heading text-2xl font-bold">{t("title")}</h1>

      {/* 搜索表单:GET 提交到本页,URL 可分享、可回退(无客户端状态) */}
      <form action={`/${locale}/search`} method="get" className="mt-4 flex gap-2">
        <Input
          name="q"
          defaultValue={q}
          placeholder={t("placeholder")}
          aria-label={t("title")}
          className="h-10"
          autoFocus={!q}
        />
        <Button type="submit" className="h-10 shrink-0">
          <SearchIcon className="mr-1 h-4 w-4" />
          {t("submit")}
        </Button>
      </form>

      {q && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {tabs.map(([k, label, n]) => (
            <Link
              key={k}
              href={tabHref(k)}
              className={
                "rounded-full border px-3 py-1 text-sm transition-colors " +
                (type === k
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:border-primary hover:text-primary")
              }
            >
              {label}
              <span className="ml-1 tabular-nums">{n}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-6 space-y-8">
        {!q || total === 0 ? (
          emptyState
        ) : type === "all" ? (
          <>
            {group(t("article"), "article", articleRes)}
            {group(t("product"), "product", productRes)}
          </>
        ) : (
          <>
            {group(type === "product" ? t("product") : t("article"), type, activeRes)}
            {activeRes && totalPages > 1 && (
              <nav className="flex items-center justify-center gap-3" aria-label={t("title")}>
                <Button variant="outline" size="sm" asChild disabled={page <= 1}>
                  <Link href={`/${locale}/search?q=${encodeURIComponent(q)}&type=${type}&page=${page - 1}`}>
                    {t("prev")}
                  </Link>
                </Button>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {t("pageOf", { page, total: totalPages })}
                </span>
                <Button variant="outline" size="sm" asChild disabled={page >= totalPages}>
                  <Link href={`/${locale}/search?q=${encodeURIComponent(q)}&type=${type}&page=${page + 1}`}>
                    {t("next")}
                  </Link>
                </Button>
              </nav>
            )}
          </>
        )}
      </div>

      {/* 热门关键词(有结果时也展示,便于继续探索) */}
      {q && total > 0 && popular.length > 0 && (
        <section className="mt-10 border-t pt-5">
          <p className="text-xs text-muted-foreground">{t("popular")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {popular.map((k) => (
              <Link
                key={k}
                href={`/${locale}/search?q=${encodeURIComponent(k)}`}
                className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                {k}
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
