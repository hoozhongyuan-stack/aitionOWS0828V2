import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { getThemeConfig, getBrandConfig } from "@/lib/config";
import { buildThemeCss } from "@/lib/theme";
import "@/styles/globals.css";

/**
 * 根布局(所有前台/后台页面共用)。
 * 职责:
 *  1) SSR 输出 <html>
 *  2) next-intl 多语言上下文
 *  3) 运行时主题注入:读取 Setting(theme) → 生成 CSS 变量 <style>,
 *     后台改主题 → 缓存失效 → 下一次请求立即生效(不重启、不重编译)
 */

/** 按扩展名推断 favicon MIME,输出 type 属性帮助浏览器正确解码(尤其 ICO) */
function faviconMime(url: string): string | undefined {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ico: "image/x-icon",
    png: "image/png",
    gif: "image/gif",
    svg: "image/svg+xml",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
  };
  return map[ext];
}

// 站点级 metadata:品牌名/图标来自后台配置(单页 TDK 由各页面 generateMetadata 覆盖)
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandConfig();
  const iconType = brand.faviconUrl ? faviconMime(brand.faviconUrl) : undefined;
  return {
    title: {
      default: brand.siteName,
      template: `%s | ${brand.siteName}`,
    },
    icons: brand.faviconUrl
      ? { icon: [{ url: brand.faviconUrl, ...(iconType ? { type: iconType } : {}) }] }
      : undefined,
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // locale 合法性校验:带点路径(如 /favicon.ico、/x.json)会跳过中间件落入本动态段,
  // 未经校验的 locale 会传入 Intl API 抛 RangeError(生产日志已被扫描器刷屏)。
  // 非法 → 统一走 styled 404。
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) notFound();

  // 校验语言合法性
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }

  // 启用该请求的静态渲染语言
  setRequestLocale(locale);

  const [messages, theme] = await Promise.all([getMessages(), getThemeConfig()]);

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* 运行时主题变量:覆盖 globals.css 默认值 */}
        <style id="theme-vars" dangerouslySetInnerHTML={{ __html: buildThemeCss(theme) }} />
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
