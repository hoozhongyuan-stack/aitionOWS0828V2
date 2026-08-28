import { getBrandConfig } from "@/lib/config";
import { listForLlms, listCategoriesWithNames } from "@/server/content";
import { getEnabledLocales } from "@/server/i18n";
import { routing } from "@/i18n/routing";

export const dynamic = "force-dynamic";

/**
 * llms.txt(生成式引擎优化):面向 AI 爬虫的站点导览,Markdown 约定。
 * 中间件 matcher 排除带点路径,本路由不会被语言前缀改写。
 */
export async function GET(req: Request) {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const locale = routing.defaultLocale;
  const [brand, enabled, cats, contents] = await Promise.all([
    getBrandConfig(),
    getEnabledLocales(),
    listCategoriesWithNames(locale).catch(() => []),
    listForLlms(locale).catch(() => []),
  ]);

  const lines: string[] = [];
  lines.push(`# ${brand.siteName}`);
  lines.push(
    `> ${brand.siteName} 企业官网:产品与服务介绍、新闻动态、联系方式。` +
      (brand.contactPhone ? ` 电话:${brand.contactPhone}。` : "") +
      (brand.contactEmail ? ` 邮箱:${brand.contactEmail}。` : "")
  );
  lines.push("");
  lines.push(
    `主要语言:${locale}(其他语言:${
      enabled
        .map((l) => l.code)
        .filter((c) => c !== locale)
        .join(", ") || "无"
    })`
  );
  lines.push("");

  lines.push("## 页面");
  lines.push(`- [首页](${base}/${locale}):企业首页与最新动态`);
  lines.push(`- [联系我们](${base}/${locale}/contact):联系电话、邮箱与在线咨询表单`);

  if (cats.length) {
    lines.push("");
    lines.push("## 栏目");
    for (const c of cats) lines.push(`- [${c.name}](${base}/${locale}/c/${c.slug})`);
  }

  if (contents.length) {
    lines.push("");
    lines.push("## 文章");
    for (const a of contents) {
      lines.push(
        `- [${a.title}](${base}/${locale}/article/${a.slug})${a.summary ? `:${a.summary}` : ""}`
      );
    }
  }

  lines.push("");
  lines.push("## 站点地图");
  lines.push(`- [sitemap.xml](${base}/sitemap.xml)`);

  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
}
