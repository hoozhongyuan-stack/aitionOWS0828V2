import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getBrandConfig, getSeoConfig } from "@/lib/config";
import { getEnabledLocales } from "@/server/i18n";
import { routing } from "@/i18n/routing";

/**
 * SEO 服务(需求 4.1):固定页 TDK、hreflang alternates、GEO 关键词合并。
 */

/** 固定页面 TDK(SeoMeta 表)→ Next Metadata;附 hreflang */
export async function getSeoMetaFor(pageKey: string, locale: string): Promise<Metadata> {
  const [row, seo, brand, locales] = await Promise.all([
    prisma.seoMeta.findUnique({ where: { pageKey_locale: { pageKey, locale } } }),
    getSeoConfig(),
    getBrandConfig(),
    getEnabledLocales(),
  ]);

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const path = pageKey === "home" ? "" : `/${pageKey}`;

  // 地域关键词自动并入(GEO 优化)
  const keywords = [row?.keywords, seo.geoKeywords].filter(Boolean).join(",") || undefined;

  return {
    title: row?.title || (pageKey === "home" ? { absolute: brand.siteName } : undefined),
    description: row?.description || undefined,
    keywords,
    alternates: {
      canonical: `${base}/${locale}${path}`,
      languages: {
        ...Object.fromEntries(locales.map((l) => [l.code, `${base}/${l.code}${path}`])),
        // x-default:面向无语言偏好的抓取方,指向默认语言版本
        "x-default": `${base}/${routing.defaultLocale}${path}`,
      },
    },
  };
}

/** 后台:列出全部固定页 TDK */
export async function listSeoMeta() {
  return prisma.seoMeta.findMany({ orderBy: [{ pageKey: "asc" }, { locale: "asc" }] });
}

/** 后台:保存一条固定页 TDK */
export async function saveSeoMeta(input: {
  pageKey: string;
  locale: string;
  title: string;
  keywords: string;
  description: string;
}) {
  await prisma.seoMeta.upsert({
    where: { pageKey_locale: { pageKey: input.pageKey, locale: input.locale } },
    update: { title: input.title, keywords: input.keywords, description: input.description },
    create: input,
  });
}

export async function deleteSeoMeta(id: number) {
  await prisma.seoMeta.delete({ where: { id } });
}
