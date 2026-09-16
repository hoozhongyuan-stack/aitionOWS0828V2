import { getBrandConfig, getSeoConfig } from "@/lib/config";
import { listForLlms, listCategoriesWithNames } from "@/server/content";
import { getEnabledLocales } from "@/server/i18n";
import { routing } from "@/i18n/routing";
import { buildLlmsText } from "@/server/content/llms";

export const dynamic = "force-dynamic";

/**
 * llms.txt(生成式引擎优化):面向 AI 爬虫的站点导览,Markdown 约定。
 * 中间件 matcher 排除带点路径,本路由不会被语言前缀改写。
 *
 * V3.0(REQ-004):已发布内容按栏目 moduleType 分区——商品独立「## 产品」分区,
 * 其余内容在「## 文章」分区;商品详情链接走 /product/[slug]。
 *
 * Next 15.5 路由类型校验器要求 route.ts 仅导出 HTTP method:
 * buildLlmsText 及其类型已拆至 @/server/content/llms。
 */
export async function GET(req: Request) {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const locale = routing.defaultLocale;
  const [brand, enabled, cats, contents, seo] = await Promise.all([
    getBrandConfig(),
    getEnabledLocales(),
    listCategoriesWithNames(locale).catch(() => []),
    listForLlms(locale).catch(() => []),
    getSeoConfig(),
  ]);

  const body = buildLlmsText({
    base,
    locale,
    siteName: brand.siteName,
    ownerName: brand.ownerName || undefined,
    tagline: brand.tagline || undefined,
    serviceArea: seo.serviceArea || undefined,
    icp: brand.icp || undefined,
    contactPhone: brand.contactPhone,
    contactEmail: brand.contactEmail,
    otherLocales: enabled.map((l) => l.code).filter((c) => c !== locale),
    categories: cats,
    contents,
  });

  return new Response(body, {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
}
