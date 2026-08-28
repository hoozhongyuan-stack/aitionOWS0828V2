import type { Metadata } from "next";
import { routing } from "@/i18n/routing";
import { getEnabledLocales } from "@/server/i18n";

/**
 * 页面级 canonical + hreflang alternates 生成(供手动构建 metadata 的动态页使用)。
 * 固定页走 server/seo 的 getSeoMetaFor(内置同款逻辑),不要混用两个口径。
 *
 * - canonical:当前语言自引用 URL
 * - languages:全部启用语言 + x-default(指向默认语言,多语言权威页声明)
 */
export async function buildAlternates(
  path: string,
  locale: string
): Promise<Metadata["alternates"]> {
  let locales: string[] = [...routing.locales];
  try {
    const enabled = await getEnabledLocales();
    if (enabled.length) locales = enabled.map((l) => l.code);
  } catch {
    // 数据库不可用时回退静态语言表
  }
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const languages: Record<string, string> = {};
  for (const l of locales) languages[l] = `${base}/${l}${path}`;
  languages["x-default"] = `${base}/${routing.defaultLocale}${path}`;
  return {
    canonical: `${base}/${locale}${path}`,
    languages,
  };
}
