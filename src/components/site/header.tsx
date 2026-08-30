"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Menu, X, Globe, User, LogOut, UserRound } from "lucide-react";
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
  /** 页头外观(主题外观配置):LOGO 高度 / 导航字号 / 导航加粗 */
  logoHeight?: string;
  navFontSize?: string;
  navBold?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  // 「个人中心」入口文案走 i18n 命名空间 account(layout 无需新增 props,向后兼容)
  const tAccount = useTranslations("account");
  const accountLabel = tAccount("menu");

  /** 切换语言:替换路径中的语言段,保持当前页面 */
  function localeHref(code: string): string {
    const parts = pathname.split("/");
    parts[1] = code;
    return parts.join("/") || `/${code}`;
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
          className={cn("hidden items-center gap-1 md:flex", navBold && "font-semibold")}
          style={{ fontSize: navFontSize }}
          aria-label="主导航"
        >
          {nav.map((item) => (
            <div key={item.id} className="group relative">
              <Link
                href={item.href}
                target={item.target}
                className={cn(
                  "rounded-md px-3 py-2 transition-colors hover:bg-accent hover:text-accent-foreground",
                  pathname === item.href && "text-primary"
                )}
              >
                {item.label}
              </Link>
              {item.children.length > 0 && (
                <div className="invisible absolute left-0 top-full z-50 min-w-40 rounded-md border bg-popover p-1 opacity-0 shadow-md transition-all group-hover:visible group-hover:opacity-100">
                  {item.children.map((child) => (
                    <Link
                      key={child.id}
                      href={child.href}
                      target={child.target}
                      className="block rounded px-3 py-2 text-sm font-normal hover:bg-accent hover:text-accent-foreground"
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

          {/* 登录态 */}
          {user ? (
            <div className="hidden items-center gap-1 md:flex">
              <span className="flex items-center gap-1 px-2 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                {user.name}
              </span>
              <Link
                href={`/${currentLocale}/account`}
                className="flex items-center gap-1 rounded-md px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <UserRound className="h-4 w-4" />
                {accountLabel}
              </Link>
              {showSubmissions && (
                <Link
                  href={`/${currentLocale}/submissions`}
                  className="rounded-md px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  {mySubmissionsLabel}
                </Link>
              )}
              <Button variant="ghost" size="sm" onClick={logout} aria-label={logoutLabel}>
                <LogOut className="h-4 w-4" />
              </Button>
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
