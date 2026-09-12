"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Menu, X, Globe, LogOut, UserRound, ShoppingCart, ChevronDown } from "lucide-react";
import { CartBadge } from "@/components/site/cart-badge";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { NavLink } from "@/server/content/nav";

/**
 * 前台页头:LOGO/品牌名 + 导航 + 语言切换 + 登录态。
 * PC 横排,H5 折叠菜单,全响应式(需求 4.7)。
 * V3.0:登录态用户菜单新增「个人中心」入口(REQ-007)。
 */

export interface HeaderLocale {
  code: string;
  name: string;
}

export function SiteHeader({
  siteName,
  logoUrl,
  nav,
  locales,
  currentLocale,
  user,
  loginLabel,
  logoutLabel,
  showSubmissions = false,
  mySubmissionsLabel,
  orderingEnabled = true,
  logoHeight = "40px",
  navFontSize = "15px",
  navBold = false,
}: {
  siteName: string;
  logoUrl: string;
  nav: NavLink[];
  locales: HeaderLocale[];
  currentLocale: string;
  user: { name: string } | null;
  loginLabel: string;
  logoutLabel: string;
  /** 投稿功能总开关(需求 4.8):关闭时不展示"我的投稿"入口 */
  showSubmissions?: boolean;
  mySubmissionsLabel?: string;
  /** 在线下单开关(V4.3):关闭时隐藏购物车入口 */
  orderingEnabled?: boolean;
  /** 页头外观(主题外观配置):LOGO 高度 / 导航字号 / 导航加粗 */
  logoHeight?: string;
  navFontSize?: string;
  navBold?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  // 「个人中心」入口文案走 i18n 命名空间 account(layout 无需新增 props,向后兼容)
  const tAccount = useTranslations("account");
  const tShop = useTranslations("shop");
  const accountLabel = tAccount("menu");
  const ordersLabel = tAccount("tabOrders");

  /** 切换语言:替换路径中的语言段,保持当前页面;预览模式保留 preview 参数(V4.6.2) */
  function localeHref(code: string): string {
    const parts = pathname.split("/");
    parts[1] = code;
    const path = parts.join("/") || `/${code}`;
    const isPreview = typeof window !== "undefined" && window.location.search.includes("preview=1");
    return isPreview ? `${path}?preview=1` : path;
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link href={`/${currentLocale}`} className="flex min-w-0 items-center gap-2">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={`${siteName} LOGO`} className="w-auto" style={{ height: logoHeight }} />
          ) : null}
          <span className="truncate font-heading text-lg font-semibold">{siteName}</span>
        </Link>

        {/* PC 导航(字号/加粗由主题外观控制) */}
        <nav
          className={cn("hidden items-center gap-2 md:flex", navBold && "font-semibold")}
          style={{ fontSize: navFontSize }}
          aria-label="主导航"
        >
          {nav.map((item) => (
            <div key={item.id} className="group relative">
              <Link
                href={item.href}
                target={item.target}
                className={cn(
                  "rounded-md px-4 py-2.5 transition-colors hover:bg-accent hover:text-accent-foreground",
                  pathname === item.href && "text-primary"
                )}
              >
                {item.label}
              </Link>
              {item.children.length > 0 && (
                <div className="invisible absolute left-0 top-full z-50 mt-2 min-w-44 rounded-xl border bg-popover p-1.5 opacity-0 shadow-lg transition-all duration-150 translate-y-1 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 before:content-[''] before:absolute before:-top-2 before:left-0 before:h-2 before:w-full">
                  {item.children.map((child) => (
                    <Link
                      key={child.id}
                      href={child.href}
                      target={child.target}
                      className="block rounded-lg px-3.5 py-2.5 text-sm font-normal hover:bg-accent hover:text-primary"
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          {/* 语言切换 */}
          {locales.length > 1 && (
            <div className="relative">
              <Button variant="ghost" size="sm" onClick={() => setLangOpen(!langOpen)} aria-label="切换语言">
                <Globe className="h-4 w-4" />
                <span className="hidden sm:inline">{locales.find((l) => l.code === currentLocale)?.name}</span>
              </Button>
              {langOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 min-w-32 rounded-md border bg-popover p-1 shadow-md">
                  {locales.map((l) => (
                    <a
                      key={l.code}
                      href={localeHref(l.code)}
                      className={cn(
                        "block rounded px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
                        l.code === currentLocale && "font-medium text-primary"
                      )}
                    >
                      {l.name}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 购物车(V4.0;V4.3 受下单开关控制) */}
          {orderingEnabled && (
            <Button variant="ghost" size="sm" asChild className="relative hidden md:inline-flex">
              <Link href={`/${currentLocale}/cart`}>
                <ShoppingCart className="h-4 w-4" />
                <span className="hidden lg:inline">{tShop("cart")}</span>
                <CartBadge />
              </Link>
            </Button>
          )}

          {/* 登录态(V4.0.1):用户菜单——头像+用户名一键入口,下拉含订单/投稿/退出 */}
          {user ? (
            <div className="relative hidden md:block">
              <button
                type="button"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-1.5 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent"
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
              >
                <UserRound className="h-4 w-4" />
                <span className="max-w-24 truncate">{user.name}</span>
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", userMenuOpen && "rotate-180")} />
              </button>
              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} aria-hidden />
                  <div className="absolute right-0 top-full z-50 mt-1 min-w-40 rounded-md border bg-popover p-1 shadow-md">
                    <Link
                      href={`/${currentLocale}/account`}
                      onClick={() => setUserMenuOpen(false)}
                      className="block rounded px-3 py-2 text-sm hover:bg-accent"
                    >
                      {accountLabel}
                    </Link>
                    <Link
                      href={`/${currentLocale}/account?tab=orders`}
                      onClick={() => setUserMenuOpen(false)}
                      className="block rounded px-3 py-2 text-sm hover:bg-accent"
                    >
                      {ordersLabel}
                    </Link>
                    {showSubmissions && (
                      <Link
                        href={`/${currentLocale}/submissions`}
                        onClick={() => setUserMenuOpen(false)}
                        className="block rounded px-3 py-2 text-sm hover:bg-accent"
                      >
                        {mySubmissionsLabel}
                      </Link>
                    )}
                    <div className="my-1 border-t" />
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        logout();
                      }}
                      className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent"
                    >
                      <LogOut className="h-4 w-4" />
                      {logoutLabel}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <Button asChild size="sm" className="hidden md:inline-flex">
              <Link href={`/${currentLocale}/login`}>{loginLabel}</Link>
            </Button>
          )}

          {/* H5 菜单按钮 */}
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(!open)} aria-label="菜单">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* H5 折叠菜单 */}
      {open && (
        <div className="border-t bg-background md:hidden">
          <nav className="container flex flex-col py-2" aria-label="移动端导航">
            {/* 购物车入口(V4.0;V4.3 受下单开关控制) */}
            {orderingEnabled && (
              <Link
                href={`/${currentLocale}/cart`}
                onClick={() => setOpen(false)}
                className="block rounded px-2 py-2.5 text-sm hover:bg-accent"
              >
                {tShop("cart")}
              </Link>
            )}
            {nav.map((item) => (
              <div key={item.id}>
                <Link
                  href={item.href}
                  target={item.target}
                  onClick={() => setOpen(false)}
                  className="block rounded px-2 py-2.5 text-sm hover:bg-accent"
                >
                  {item.label}
                </Link>
                {item.children.map((child) => (
                  <Link
                    key={child.id}
                    href={child.href}
                    target={child.target}
                    onClick={() => setOpen(false)}
                    className="block rounded px-6 py-2 text-sm text-muted-foreground hover:bg-accent"
                  >
                    {child.label}
                  </Link>
                ))}
              </div>
            ))}
            {user ? (
              <>
                <Link
                  href={`/${currentLocale}/account`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-1.5 rounded px-2 py-2.5 text-sm hover:bg-accent"
                >
                  <UserRound className="h-4 w-4" />
                  {accountLabel}
                </Link>
                <Link
                  href={`/${currentLocale}/account?tab=orders`}
                  onClick={() => setOpen(false)}
                  className="block rounded px-2 py-2.5 text-sm hover:bg-accent"
                >
                  {ordersLabel}
                </Link>
                {showSubmissions && (
                  <Link
                    href={`/${currentLocale}/submissions`}
                    onClick={() => setOpen(false)}
                    className="block rounded px-2 py-2.5 text-sm hover:bg-accent"
                  >
                    {mySubmissionsLabel}
                  </Link>
                )}
                <button onClick={logout} className="rounded px-2 py-2.5 text-left text-sm text-muted-foreground hover:bg-accent">
                  {logoutLabel}({user.name})
                </button>
              </>
            ) : (
              <Link
                href={`/${currentLocale}/login`}
                onClick={() => setOpen(false)}
                className="rounded px-2 py-2.5 text-sm text-primary hover:bg-accent"
              >
                {loginLabel}
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
