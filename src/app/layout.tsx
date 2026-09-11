import { headers } from "next/headers";
import { routing } from "@/i18n/routing";
import { getThemeConfig, THEME_PRESETS_ALLOWED } from "@/lib/config";
import { buildThemeCss } from "@/lib/theme";
import "@/styles/globals.css";

/**
 * 根布局(V3.3 C1:html 壳自 [locale]/layout 上移至此)。
 * 职责:
 *  1) SSR 输出 <html lang data-theme> + 运行时主题变量 <style>(读 Setting(theme),
 *     后台改主题 → 缓存失效 → 下一次请求立即生效)
 *  2) 为根级 not-found(全局 404)提供渲染容器——Next 要求根级页面必须有根布局;
 *     [locale] 段外的未匹配路径(带点文件名、段内无匹配 page)均由此壳承接品牌 404
 *  3) 多语言上下文与 GEO 记录点仍在 [locale]/layout.tsx(该层不再输出 html/body)
 *
 * lang 取自 middleware 注入的 x-geo-path 首段(合法 locale 方采用),缺省编译期默认语言;
 * 不用 next-intl getLocale():根级 404 链路无 [locale] 段,避免其在无 locale 上下文抛错。
 */
function localeFromPath(path: string | null): string {
  const seg = (path ?? "").split("/").filter(Boolean)[0];
  return seg && (routing.locales as readonly string[]).includes(seg) ? seg : routing.defaultLocale;
}

/**
 * 需在 <html> 上输出 data-theme 的风格包(有专属 CSS 段与动效的主题)。
 * classic 为默认主题无属性故排除;白名单自 THEME_PRESETS_ALLOWED 派生,
 * 新增主题只需改 lib/config 一处 + 后台预设卡片 + globals.css 视觉段。
 */
const THEMED_PRESETS = new Set<string>(THEME_PRESETS_ALLOWED.filter((p) => p !== "classic"));

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [h, theme] = await Promise.all([headers(), getThemeConfig()]);
  const lang = localeFromPath(h.get("x-geo-path"));

  return (
    <html lang={lang} suppressHydrationWarning data-theme={THEMED_PRESETS.has(theme.preset) ? theme.preset : undefined}>
      <head>
        {/* 运行时主题变量:覆盖 globals.css 默认值 */}
        <style id="theme-vars" dangerouslySetInnerHTML={{ __html: buildThemeCss(theme) }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
