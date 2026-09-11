import { headers } from "next/headers";
import { routing } from "@/i18n/routing";
import { getThemeConfig } from "@/lib/config";
import { buildThemeCss } from "@/lib/theme";
import "@/styles/globals.css";

/**
 * 根布局(V3.3 C1:html 壳自 [locale]/layout 上移至此)。
 * 职责:
 *  1) SSR 输出 <html lang> + 运行时主题变量 <style>(读 Setting(theme),
 *     后台改主题 → 缓存失效 → 下一次请求立即生效)
 *  2) 为根级 not-found(全局 404)提供渲染容器——Next 要求根级页面必须有根布局;
 *     [locale] 段外的未匹配路径(带点文件名、段内无匹配 page)均由此壳承接品牌 404
 *  3) 多语言上下文与 GEO 记录点仍在 [locale]/layout.tsx(该层不再输出 html/body)
 *
 * V4.4.0:data-theme **不再挂在 <html>** —— 它由前台布局容器承载
 * (src/app/[locale]/(site)/layout.tsx)。这样后台不受主题 CSS 段影响,
 * 无论前台切什么主题,后台都保持统一的中性配色。
 * 本布局只保留 :root 的主题变量注入,供无前台容器的页面(根级 404 等)兜底。
 *
 * lang 取自 middleware 注入的 x-geo-path 首段(合法 locale 方采用),缺省编译期默认语言;
 * 不用 next-intl getLocale():根级 404 链路无 [locale] 段,避免其在无 locale 上下文抛错。
 */
function localeFromPath(path: string | null): string {
  const seg = (path ?? "").split("/").filter(Boolean)[0];
  return seg && (routing.locales as readonly string[]).includes(seg) ? seg : routing.defaultLocale;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [h, theme] = await Promise.all([headers(), getThemeConfig()]);
  const lang = localeFromPath(h.get("x-geo-path"));

  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        {/* 运行时主题变量:覆盖 globals.css 默认值 */}
        <style id="theme-vars" dangerouslySetInnerHTML={{ __html: buildThemeCss(theme) }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
