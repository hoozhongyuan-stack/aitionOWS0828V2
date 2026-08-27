import { defineRouting } from "next-intl/routing";

/**
 * 多语言路由配置(纯配置,禁止在此引入任何运行时依赖)。
 * 重要:middleware(Edge)会打包本文件 —— 此处若引入 next-intl/navigation
 *       会级联把 request 配置乃至 Prisma 拖进 Edge 包导致生产崩溃。
 * 语言集合为"编译期已知集合";前台启用/默认语言由后台 Locale 表运行时控制。
 */
export const routing = defineRouting({
  // 模板内置支持的语言(新增语言:此处登记 + 添加 messages/{code}.json)
  locales: ["zh-CN", "en"],
  // 编译期默认语言(运行时默认由 /api/flags 提供,middleware 裸域跳转优先采用)
  defaultLocale: "zh-CN",
  // URL 前缀策略:默认语言也带前缀,利于 SEO 明确 hreflang
  localePrefix: "always",
});

export type AppLocale = (typeof routing.locales)[number];
