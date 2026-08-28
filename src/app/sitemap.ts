import type { MetadataRoute } from "next";
import { listForSitemap } from "@/server/content";
import { getEnabledLocales } from "@/server/i18n";

// 后台开关/内容变化需即时生效:sitemap 路由不做构建期静态化
export const dynamic = "force-dynamic";
import { routing } from "@/i18n/routing";

/**
 * 动态 sitemap.xml(需求 4.1):
 * 首页 + 可见栏目 + 全部已发布内容,按启用语言输出并附 hreflang alternates。
 * 内容发布/下架即自动反映,无需手动维护。
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  let locales: string[] = [...routing.locales];
  let contents: { slug: string; updatedAt: Date }[] = [];
  let categories: { slug: string }[] = [];
  try {
    const [enabled, data] = await Promise.all([getEnabledLocales(), listForSitemap()]);
    if (enabled.length) locales = enabled.map((l) => l.code);
    contents = data.contents;
    categories = data.categories;
  } catch {
    // 构建期数据库不可用时输出最小地图
  }

  const alt = (path: string) => ({
    languages: Object.fromEntries(locales.map((l) => [l, `${base}/${l}${path}`])),
  });

  const entries: MetadataRoute.Sitemap = [];
  for (const locale of locales) {
    entries.push({
      url: `${base}/${locale}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
      alternates: alt(""),
    });
    for (const c of categories) {
      entries.push({
        url: `${base}/${locale}/c/${c.slug}`,
        changeFrequency: "daily",
        priority: 0.8,
        alternates: alt(`/c/${c.slug}`),
      });
    }
    for (const c of contents) {
      entries.push({
        url: `${base}/${locale}/article/${c.slug}`,
        lastModified: c.updatedAt,
        changeFrequency: "weekly",
        priority: 0.6,
        alternates: alt(`/article/${c.slug}`),
      });
    }
  }
  return entries;
}
