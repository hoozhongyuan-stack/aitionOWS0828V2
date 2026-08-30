import { beforeAll, describe, expect, it } from "vitest";

/**
 * TEST-007(对应 AC-005 / REQ-004):商品纳入 GEO 收录——
 * - listForLlms 数据源含 moduleType 与商品条目
 * - GET /llms.txt 按 moduleType 分区:商品独立「## 产品」分区,文章在「## 文章」
 * - sitemap 包含商品详情 URL(/product/[slug]),商品不得再以 /article/ URL 出现
 */

let prisma: typeof import("@/lib/db")["prisma"];
let listForLlms: typeof import("@/server/content")["listForLlms"];
let llmsGet: typeof import("@/app/llms.txt/route")["GET"];
let sitemap: typeof import("@/app/sitemap")["default"];

beforeAll(async () => {
  ({ prisma } = await import("@/lib/db"));
  ({ listForLlms } = await import("@/server/content"));
  ({ GET: llmsGet } = await import("@/app/llms.txt/route"));
  sitemap = (await import("@/app/sitemap")).default;

  // seed:product 栏目 + article 栏目,各一条已发布内容
  const prodCat = await prisma.category.create({
    data: {
      slug: "llms-prod-cat",
      moduleType: "product",
      visible: true,
      translations: { create: { locale: "zh-CN", name: "产品栏目" } },
    },
  });
  const newsCat = await prisma.category.create({
    data: {
      slug: "llms-news-cat",
      moduleType: "article",
      visible: true,
      translations: { create: { locale: "zh-CN", name: "新闻栏目" } },
    },
  });
  await prisma.content.create({
    data: {
      slug: "llms-product-item",
      categoryId: prodCat.id,
      status: "PUBLISHED",
      authorName: "测试作者",
      publishAt: new Date("2026-08-01T00:00:00Z"),
      translations: {
        create: { locale: "zh-CN", title: "商品甲", summary: "商品甲摘要", body: "<p>x</p>" },
      },
    },
  });
  await prisma.content.create({
    data: {
      slug: "llms-article-item",
      categoryId: newsCat.id,
      status: "PUBLISHED",
      authorName: "测试作者",
      publishAt: new Date("2026-08-02T00:00:00Z"),
      translations: {
        create: { locale: "zh-CN", title: "文章乙", summary: "文章乙摘要", body: "<p>y</p>" },
      },
    },
  });
});

describe("TEST-007:llms.txt / sitemap 商品收录", () => {
  it("listForLlms 返回条目携带 moduleType 且包含商品条目", async () => {
    const items = await listForLlms("zh-CN");
    const product = items.find((i) => i.slug === "llms-product-item");
    const article = items.find((i) => i.slug === "llms-article-item");
    expect(product).toBeTruthy();
    expect(product!.moduleType).toBe("product");
    expect(product!.title).toBe("商品甲");
    expect(article).toBeTruthy();
    expect(article!.moduleType).toBe("article");
  });

  it("llms.txt 按 moduleType 分区:商品在「## 产品」分区,文章在「## 文章」分区", async () => {
    const res = await llmsGet(new Request("http://localhost:3000/llms.txt"));
    expect(res.status).toBe(200);
    const text = await res.text();

    // 品牌头保留
    expect(text).toContain("# ");
    // 两个分区都存在
    expect(text).toContain("## 产品");
    expect(text).toContain("## 文章");
    // 商品条目走 /product/ 详情链接,含摘要(base 随 NEXT_PUBLIC_SITE_URL 变化,断言路径)
    expect(text).toContain("](http");
    expect(text).toContain("[商品甲](");
    expect(text).toContain("/zh-CN/product/llms-product-item):商品甲摘要");
    // 文章条目沿用 /article/ 链接
    expect(text).toContain("[文章乙](");
    expect(text).toContain("/zh-CN/article/llms-article-item)");

    // 分区隔离:产品区内不含文章条目,文章区内不含商品条目
    const productStart = text.indexOf("## 产品");
    const articleStart = text.indexOf("## 文章");
    expect(productStart).toBeLessThan(articleStart);
    const productSection = text.slice(productStart, articleStart);
    const articleSection = text.slice(articleStart);
    expect(productSection).toContain("llms-product-item");
    expect(productSection).not.toContain("llms-article-item");
    expect(articleSection).toContain("llms-article-item");
    expect(articleSection).not.toContain("llms-product-item");
  });

  it("sitemap 包含商品详情 URL,且商品不再以 /article/ URL 出现", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    // 商品详情 URL(/zh-CN 与 /en 两个语言)
    expect(urls).toContainEqual(expect.stringContaining("/zh-CN/product/llms-product-item"));
    expect(urls).toContainEqual(expect.stringContaining("/en/product/llms-product-item"));

    // 文章仍为 /article/ URL(存量行为不变)
    expect(urls).toContainEqual(expect.stringContaining("/zh-CN/article/llms-article-item"));

    // 商品不得再以 /article/ URL 出现(避免同一内容双 URL)
    const articleUrls = urls.filter((u) => u.includes("/article/"));
    expect(articleUrls).not.toContainEqual(expect.stringContaining("llms-product-item"));
  });
});
