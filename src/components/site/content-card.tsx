import Link from "next/link";
import { Eye, ThumbsUp, UserRound } from "lucide-react";
import { formatMoney, safeDateLocale } from "@/lib/utils";
import { resolveContentDetailPath } from "@/server/content";

/**
 * 内容卡片(栏目页/首页共用):封面 + 标题 + 摘要 + 数据。
 * 详情链接按栏目模块类型分流(V3.0 REQ-003):product 栏目走 /product/[slug],
 * 其余沿用 /article/[slug](存量行为不变);未传 moduleType 保持旧行为。
 */
export function ContentCard({
  locale,
  item,
  viewsLabel,
  moduleType,
  featured,
}: {
  locale: string;
  item: {
    slug: string;
    title: string;
    summary: string | null;
    coverUrl: string | null;
    /** 作者显示名(V4.7.0):列表卡片展示署名 */
    authorName?: string | null;
    viewCount: number;
    likeCount: number;
    publishedAt: Date | string;
    /** V4.0 交易字段:有价商品卡片展示价格;null 不展示(仅询盘) */
    priceCents?: number | null;
    currency?: string | null;
  };
  viewsLabel: string;
  /** 所属栏目模块类型(product → 商品详情路由);缺省按 article 处理 */
  moduleType?: string;
  /** 杂志布局首条特写:更大的封面比例与标题 */
  featured?: boolean;
}) {
  const date = new Date(item.publishedAt);
  return (
    <Link
      href={resolveContentDetailPath(moduleType ?? "article", item.slug, locale)}
      className="group flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md"
    >
      {item.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.coverUrl}
          alt={item.title}
          loading="lazy"
          className={(featured ? "aspect-[2/1] " : "aspect-[16/9] ") + "w-full object-cover transition-transform group-hover:scale-[1.02]"}
        />
      ) : (
        <div className="aspect-[16/9] w-full bg-muted" aria-hidden />
      )}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className={(featured ? "text-base sm:text-lg " : "") + "line-clamp-2 font-heading font-semibold group-hover:text-primary"}>{item.title}</h3>
        {item.summary && <p className="line-clamp-2 text-sm text-muted-foreground">{item.summary}</p>}
        {item.priceCents != null && moduleType === "product" && (
          <span className="font-heading text-lg font-bold text-primary">
            {formatMoney(item.priceCents, item.currency || "USD", locale)}
          </span>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-xs text-muted-foreground">
          {/* 作者(V4.7.0):与详情页署名图标一致;为空时不渲染占位 */}
          {item.authorName && (
            <span className="inline-flex max-w-32 items-center gap-1" title={item.authorName}>
              <UserRound className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{item.authorName}</span>
            </span>
          )}
          <time dateTime={date.toISOString()}>{date.toLocaleDateString(safeDateLocale(locale))}</time>
          <span className="inline-flex items-center gap-1" title={viewsLabel}>
            <Eye className="h-3.5 w-3.5" />
            {item.viewCount}
          </span>
          <span className="inline-flex items-center gap-1">
            <ThumbsUp className="h-3.5 w-3.5" />
            {item.likeCount}
          </span>
        </div>
      </div>
    </Link>
  );
}
