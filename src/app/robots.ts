import type { MetadataRoute } from "next";

// 后台开关/内容变化需即时生效:robots 路由不做构建期静态化
export const dynamic = "force-dynamic";
import { getSeoConfig } from "@/lib/config";
import { AI_CRAWLERS } from "@/lib/seo/ai-crawlers";

/**
 * 动态 robots.txt(需求 4.1 + GEO 策略):
 * - 「允许收录」总开关关闭 → 对所有爬虫全站 Disallow(最高优先语义)
 * - 主流 AI 检索爬虫单独分组显式声明(GEO 立场:默认允许抓取以进入生成式引用;
 *   robots 规则中具体组会覆盖 *,因此每组必须自述 Allow/Disallow)
 * - 后台可配「额外屏蔽路径」,对 * 与 AI 组同时生效
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  let allowIndex = true;
  let aiCrawlAllow = true;
  let extra: string[] = [];
  try {
    const seo = await getSeoConfig();
    allowIndex = seo.allowIndex;
    aiCrawlAllow = seo.aiCrawlAllow !== false;
    extra = seo.extraDisallow
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.startsWith("/"));
  } catch {
    // 数据库不可用时按默认允许
  }

  if (!allowIndex) {
    return { rules: { userAgent: "*", disallow: "/" }, sitemap: `${base}/sitemap.xml` };
  }

  // 主流 AI 检索/训练爬虫(生成式引擎优化:默认放行内容抓取)。
  // V4.8.2:名单改为从 @/lib/seo/ai-crawlers 派生 —— 此前本地硬编码 9 个,
  // 与 GEO 识别表(18 个)漂移,导致关闭 aiCrawlAllow 时漏封 10 个爬虫却仍被计为 AI 抓取。
  const aiAgents = AI_CRAWLERS.map((c) => c.token);

  const rules: MetadataRoute.Robots["rules"] = [
    { userAgent: "*", allow: "/", disallow: ["/admin", "/api", ...extra] },
    {
      userAgent: aiAgents,
      allow: aiCrawlAllow ? "/" : undefined,
      disallow: aiCrawlAllow ? ["/admin", "/api", ...extra] : "/",
    },
  ];

  return { rules, sitemap: `${base}/sitemap.xml` };
}
