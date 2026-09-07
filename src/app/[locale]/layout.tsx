import type { Metadata } from "next";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { getBrandConfig } from "@/lib/config";
import { matchBot, matchReferral, recordCrawl, recordReferral } from "@/server/geo";

/**
 * 语言布局(所有前台/后台页面的多语言上下文层)。
 * V3.3 C1:html/head/body 壳上移至根布局(src/app/layout.tsx,含 lang/data-theme/主题
 * 变量注入)——本层不再输出 html,负责:
 *  1) next-intl 多语言上下文(NextIntlClientProvider)
 *  2) locale 合法性校验(非法 → 根级品牌 404)
 *  3) GEO 监测记录点(V3.2)
 *  4) metadataBase(V3.1 REQ-003):相对路径 OG 图片/URL 据此解析为绝对地址
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
    // REQ-003:仅取受信环境变量,缺省回退本地地址(dev 同值,见 .env.example)
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
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

  const messages = await getMessages();

  // GEO 监测(V3.2):服务端识别 AI 爬虫与 AI 渠道引荐,异步记录不阻塞渲染。
  // 爬虫不执行 JS,客户端埋点抓不到它们——此处是唯一可靠记录点。
  // 排除后台/静态资源路径;非 AI 流量零开销(仅一次字符串匹配)。
  const h = await headers();
  // x-geo-path 由 middleware 注入,已含完整 pathname(含 locale 前缀)——不再重复拼接(DEF-013)
  const reqPath = h.get("x-geo-path") ?? `/${locale}`;
  const isSitePath = !/\/admin|\/_next|\/uploads|\/api/.test(reqPath);
  if (isSitePath) {
    const bot = matchBot(h.get("user-agent"));
    const referral = matchReferral(h.get("referer"));
    if (bot) {
      void recordCrawl(bot, reqPath);
    } else if (referral) {
      void recordReferral(referral, reqPath, true);
    }
  }

  return <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>;
}
