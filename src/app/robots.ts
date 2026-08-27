import type { MetadataRoute } from "next";
import { getSeoConfig } from "@/lib/config";

/**
 * 动态 robots.txt(需求 4.1):
 * 后台可配「允许收录」总开关与额外屏蔽路径,保存即生效。
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  let allowIndex = true;
  let extra: string[] = [];
  try {
    const seo = await getSeoConfig();
    allowIndex = seo.allowIndex;
    extra = seo.extraDisallow
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.startsWith("/"));
  } catch {
    // 数据库不可用时按默认允许
  }

  if (!allowIndex) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api", ...extra],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
