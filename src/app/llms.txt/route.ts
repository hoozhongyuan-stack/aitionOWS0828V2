import { getBrandConfig } from "@/lib/config";
import { listForLlms, listCategoriesWithNames } from "@/server/content";
import { getEnabledLocales } from "@/server/i18n";
import { routing } from "@/i18n/routing";

export const dynamic = "force-dynamic";

/**
 * llms.txt(生成式引擎优化):面向 AI 爬虫的站点导览,Markdown 约定。
 * 中间件 matcher 排除带点路径,本路由不会被语言前缀改写。
 *
 * V3.0(REQ-004):已发布内容按栏目 moduleType 分区——商品独立「## 产品」分区,
 * 其余内容在「## 文章」分区;商品详情链接走 /product/[slug]。
 */

/** llms.txt 组装入参(route 聚合数据,组装保持纯函数以便测试) */
export interface LlmsTextInput {
  base: string;
  locale: string;
  siteName: string;
  contactPhone?: string;
  contactEmail?: string;
  otherLocales: string[];
  categories: { slug: string; name: string }[];
  contents: { slug: string; title: string; summary: string; moduleType: string }[];
}

/** llms.txt 文本组装(纯函数):品牌头 + 页面/栏目 + 产品/文章分区 + 站点地图 */
export function buildLlmsText(input: LlmsTextInput): string {
  const { base, locale } = input;
  const lines: string[] = [];
  lines.push(`# ${input.siteName}`);
  lines.push(
    `> ${input.siteName} 企业官网:产品与服务介绍、新闻动态、联系方式。` +
      (input.contactPhone ? ` 电话:${input.contactPhone}。` : "") +
      (input.contactEmail ? ` 邮箱:${input.contactEmail}。` : "")
  );
  lines.push("");
  lines.push(
    `主要语言:${locale}(其他语言:${input.otherLocales.join(", ") || "无"})`
  );
  lines.push("");

  lines.push("## 页面");
  lines.push(`- [首页](${base}/${locale}):企业首页与最新动态`);
  lines.push(`- [联系我们](${base}/${locale}/contact):联系电话、邮箱与在线咨询表单`);

  if (input.categories.length) {
    lines.push("");
    lines.push("## 栏目");
    for (const c of input.categories) lines.push(`- [${c.name}](${base}/${locale}/c/${c.slug})`);
  }

  // 按模块类型分区:商品(product)独立产品分区,其余进文章分区
  const products = input.contents.filter((c) => c.moduleType === "product");
  const articles = input.contents.filter((c) => c.moduleType !== "product");

  if (products.length) {
    lines.push("");
    lines.push("## 产品");
    for (const p of products) {
      lines.push(
        `- [${p.title}](${base}/${locale}/product/${p.slug})${p.summary ? `:${p.summary}` : ""}`
      );
    }
  }

  if (articles.length) {
    lines.push("");
    lines.push("## 文章");
    for (const a of articles) {
      lines.push(
        `- [${a.title}](${base}/${locale}/article/${a.slug})${a.summary ? `:${a.summary}` : ""}`
      );
    }
  }

  lines.push("");
  lines.push("## 站点地图");
  lines.push(`- [sitemap.xml](${base}/sitemap.xml)`);

  return lines.join("\n");
}

export async function GET(req: Request) {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const locale = routing.defaultLocale;
  const [brand, enabled, cats, contents] = await Promise.all([
    getBrandConfig(),
    getEnabledLocales(),
    listCategoriesWithNames(locale).catch(() => []),
    listForLlms(locale).catch(() => []),
  ]);

  const body = buildLlmsText({
    base,
    locale,
    siteName: brand.siteName,
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
