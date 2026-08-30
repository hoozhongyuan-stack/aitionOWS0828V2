import type { MetadataRoute } from "next";
import { listForSitemap, listForLlms } from "@/server/content";
import { getEnabledLocales } from "@/server/i18n";

// 后台开关/内容变化需即时生效:sitemap 路由不做构建期静态化
export const dynamic = "force-dynamic";
import { routing } from "@/i18n/routing";

/**
 * 动态 sitemap.xml(需求 4.1):
 * 首页 + 可见栏目 + 全部已发布内容,按启用语言输出并附 hreflang alternates。
 * 内容发布/下架即自动反映,无需手动维护。
 *
 * V3.0(REQ-004):product 栏目内容输出 /product/[slug] 详情 URL(不再以
 * /article/ URL 出现,避免同一内容双 URL);商品 lastModified 无独立来源取当前时间。
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  let locales: string[] = [...routing.locales];
  let contents: { slug: string; updatedAt: Date }[] = [];
  let categories: { slug: string }[] = [];
  let products: { slug: string }[] = [];
  try {
    const [enabled, data, llms] = await Promise.all([
      getEnabledLocales(),
      listForSitemap(),
      // moduleType 数据源:listForSitemap 不含栏目类型,商品分流经 listForLlms
      listForLlms(routing.defaultLocale).catch(() => []),
    ]);
    if (enabled.length) locales = enabled.map((l) => l.code);
    categories = data.categories;
    products = llms.filter((c) => c.moduleType === "product").map((c) => ({ slug: c.slug }));
    const productSlugs = new Set(products.map((p) => p.slug));
    // 文章遍历剔除商品,商品统一走 /product/ 详情 URL
    contents = data.contents.filter((c) => !productSlugs.has(c.slug));
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
    for (const c of products) {
      entries.push({
        url: `${base}/${locale}/product/${c.slug}`,
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: 0.6,
        alternates: alt(`/product/${c.slug}`),
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
