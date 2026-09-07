import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Bookmark, FileText, ReceiptText } from "lucide-react";
import { getActiveUserSession } from "@/lib/auth/session";
import { listMyFavorites, listMySubmissions } from "@/server/ugc";
import { listOrdersByUser } from "@/server/order";
import { formatMoney } from "@/lib/utils";
import { RefundRequestButton } from "@/app/[locale]/(site)/account/refund-request-button";
import { resolveContentDetailPath } from "@/server/content";
import { cn, safeDateLocale } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  buildLoginRedirectUrl,
  favoriteKind,
  parseAccountTab,
} from "@/app/[locale]/(site)/account/logic";
import { UnfavoriteButton } from "@/app/[locale]/(site)/account/unfavorite-button";
import { LogoutButton } from "@/app/[locale]/(site)/account/logout-button";

export const metadata: Metadata = {
  // 个人中心无索引价值:noindex(登录墙后的用户视图)
  robots: { index: false, follow: true },
};

/**
 * 个人中心(V3.0 REQ-007 / AC-008):登录态专属视图。
 * - Tab 结构:我的收藏(默认)/ 我的投稿(?tab=submissions 切换,服务端渲染)
 * - 收藏:类型标签(文章/商品)+ 标题链接(按 moduleType 分流详情路由)+
 *   栏目名 + 收藏时间 + 取消收藏;空态文案
 * - 投稿:复用既有 /submissions 数据与展示(审核状态可见)
 * - 未登录访问 → 登录页(?redirect= 回跳本页);页内可退出登录
 */

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}

export default async function AccountPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  // 写接口同口径(L-3):仅 ACTIVE 账号可见;禁用账号视同未登录跳转登录页
  const user = await getActiveUserSession();
  if (!user) redirect(buildLoginRedirectUrl(locale, `/${locale}/account`));

  const sp = await searchParams;
  const tab = parseAccountTab(sp.tab);

  const [t, tSubmission, favorites, submissions, myOrders] = await Promise.all([
    getTranslations("account"),
    getTranslations("submission"),
    listMyFavorites(user.id, locale),
    // 投稿/订单视图才需要对应数据(其余视图零开销)
    tab === "submissions" ? listMySubmissions(user.id) : Promise.resolve([]),
    tab === "orders" ? listOrdersByUser(user.id) : Promise.resolve([]),
  ]);

  const statusBadge = (s: string) => {
    if (s === "PUBLISHED") return <Badge>{tSubmission("statusPublished")}</Badge>;
    if (s === "REJECTED") return <Badge variant="secondary">{tSubmission("statusRejected")}</Badge>;
    return <Badge variant="outline">{tSubmission("statusPending")}</Badge>;
  };

  const tabs: { key: "favorites" | "submissions" | "orders"; href: string; label: string; icon: React.ReactNode }[] = [
    { key: "favorites", href: `/${locale}/account`, label: t("tabFavorites"), icon: <Bookmark className="h-4 w-4" /> },
    { key: "submissions", href: `/${locale}/account?tab=submissions`, label: t("tabSubmissions"), icon: <FileText className="h-4 w-4" /> },
    { key: "orders", href: `/${locale}/account?tab=orders`, label: t("tabOrders"), icon: <ReceiptText className="h-4 w-4" /> },
  ];

  return (
    <main className="container max-w-3xl py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="font-heading text-2xl font-bold">{t("title")}</h1>
        <LogoutButton />
      </div>

      {/* Tab 切换(服务端 searchParams 渲染,无客户端状态) */}
      <nav className="mb-6 flex gap-2 border-b" aria-label={t("title")}>
        {tabs.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            aria-current={tab === item.key ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
              tab === item.key
                ? "border-primary font-medium text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
      </nav>

      {tab === "orders" ? (
        myOrders.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
            {t("ordersEmpty")}
          </div>
        ) : (
          <ul className="space-y-3">
            {myOrders.map((o) => {
              const statusLabel = t(`orderStatus.${o.status}`);
              const shipped = o.status === "SHIPPED" || o.status === "COMPLETED";
              return (
                <li key={o.id} className="rounded-lg border p-4">
                  <details>
                    <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium">{o.no}</span>
                          <Badge variant={o.status === "COMPLETED" ? "default" : "outline"}>{statusLabel}</Badge>
                          {/* 售后状态(V4.2) */}
                          {o.refund && (
                            <Badge variant={o.refund.status === "APPROVED" ? "default" : "secondary"}>
                              {o.refund.status === "PENDING"
                                ? t("refundPending")
                                : o.refund.status === "APPROVED"
                                  ? t("refundApproved")
                                  : t("refundRejected")}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {t("orderTime")}
                          {new Date(o.createdAt).toLocaleString(safeDateLocale(locale))}
                        </div>
                      </div>
                      <span className="font-heading text-lg font-bold">
                        {formatMoney(o.grandTotalCents, o.currency, locale)}
                      </span>
                    </summary>
                    <div className="mt-4 space-y-3 border-t pt-3 text-sm">
                      <div>
                        <p className="mb-1 font-medium">{t("orderItems")}</p>
                        <ul className="space-y-2 text-muted-foreground">
                          {o.items.map((i) => (
                            <li key={i.id} className="flex items-center gap-3">
                              {i.coverUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={i.coverUrl} alt={i.titleSnapshot} className="h-10 w-14 shrink-0 rounded object-cover" />
                              ) : (
                                <div className="h-10 w-14 shrink-0 rounded bg-muted" aria-hidden />
                              )}
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-foreground">{i.titleSnapshot}</span>
                                {i.spu && <span className="block text-xs">SPU: {i.spu}</span>}
                              </span>
                              <span className="shrink-0 text-foreground">
                                {formatMoney(i.priceCentsSnapshot * i.qty, i.currency, locale)}
                              </span>
                            </li>
                          ))}
                        </ul>
                        <p className="mt-2 text-right">
                          {t("orderTotal")}:
                          <span className="font-semibold text-foreground">
                            {formatMoney(o.grandTotalCents, o.currency, locale)}
                          </span>
                          {o.shippingCents > 0 && (
                            <span className="ml-2 text-xs">
                              ({t("shipping")} {formatMoney(o.shippingCents, o.currency, locale)})
                            </span>
                          )}
                        </p>
                      </div>
                      {/* 物流信息(V4.0.1):发货后展示,后台/前台同源 */}
                      {shipped && (o.shippingCarrier || o.trackingNumber || o.adminNote) && (
                        <div className="rounded-md bg-muted p-3">
                          <p className="mb-1 font-medium">{t("orderShipping")}</p>
                          <p className="text-muted-foreground">
                            {o.shippingCarrier && (
                              <span>
                                {t("orderCarrier")}:{o.shippingCarrier}{" "}
                              </span>
                            )}
                            {o.trackingNumber && (
                              <span>
                                {t("orderTracking")}:{o.trackingNumber}{" "}
                              </span>
                            )}
                            {o.adminNote && <span>({o.adminNote})</span>}
                          </p>
                        </div>
                      )}
                      {/* 售后(V4.2):可申请状态且未申请 → 申请按钮;已有申请 → 结果展示 */}
                      {["CONFIRMED", "SHIPPED", "COMPLETED"].includes(o.status) && (
                        <div className="flex items-center justify-between rounded-md border p-3">
                          <span className="text-sm text-muted-foreground">
                            {o.refund
                              ? `${t("refundPending")} · ${o.refund.reason}`
                              : t("refundRequest")}
                          </span>
                          {!o.refund && <RefundRequestButton orderNo={o.no} />}
                        </div>
                      )}
                      {o.refund && (
                        <div className="rounded-md bg-muted p-3 text-sm">
                          <p className="text-muted-foreground">{t("refundReason")}: {o.refund.reason}</p>
                          {o.refund.status === "APPROVED" && o.refund.refundAmountCents != null && (
                            <p className="mt-1">
                              {t("refundAmount")}:{" "}
                              <span className="font-semibold text-foreground">
                                {formatMoney(o.refund.refundAmountCents, o.currency, locale)}
                              </span>
                            </p>
                          )}
                          {o.refund.adminNote && (
                            <p className="mt-1 text-muted-foreground">
                              {t("refundNote")}: {o.refund.adminNote}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )
      ) : tab === "favorites" ? (
        favorites.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
            {t("emptyFavorites")}
          </div>
        ) : (
          <ul className="space-y-3">
            {favorites.map((f) => {
              const kind = favoriteKind(f.moduleType);
              return (
                <li key={f.contentId} className="flex items-center gap-4 rounded-lg border p-4">
                  {f.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={f.coverUrl}
                      alt={f.title}
                      className="h-14 w-20 flex-none rounded-md object-cover"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge variant={kind === "product" ? "default" : "outline"}>
                        {kind === "product" ? t("typeProduct") : t("typeArticle")}
                      </Badge>
                      <span className="truncate text-xs text-muted-foreground">{f.categoryName}</span>
                    </div>
                    <Link
                      href={resolveContentDetailPath(f.moduleType, f.slug, locale)}
                      className="block truncate font-medium hover:text-primary"
                    >
                      {f.title}
                    </Link>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {t("favoritedAt")}
                      {new Date(f.favoritedAt).toLocaleDateString(safeDateLocale(locale))}
                    </div>
                  </div>
                  <UnfavoriteButton contentId={f.contentId} />
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{tSubmission("myList")}</h2>
            <Link
              href={`/${locale}/submit`}
              className="text-sm text-primary underline underline-offset-2"
            >
              {tSubmission("title")}
            </Link>
          </div>
          {submissions.length === 0 ? (
            <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
              {tSubmission("empty")}
            </div>
          ) : (
            <ul className="space-y-3">
              {submissions.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-4 rounded-lg border p-4">
                  <div className="min-w-0">
                    {r.status === "PUBLISHED" ? (
                      <Link
                        href={`/${locale}/article/${r.slug}`}
                        className="truncate font-medium hover:text-primary"
                      >
                        {r.title}
                      </Link>
                    ) : (
                      <span className="truncate font-medium">{r.title}</span>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {r.category} · {new Date(r.createdAt).toLocaleDateString(safeDateLocale(locale))}
                    </div>
                  </div>
                  {statusBadge(r.status)}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
