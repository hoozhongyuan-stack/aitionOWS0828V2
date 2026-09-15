import { beforeAll, describe, expect, it } from "vitest";

/**
 * 站内搜索服务层(V4.7.2)。
 *
 * 锁住:匹配范围(标题/摘要/栏目名)、只搜可见栏目下的已发布内容、类型过滤、
 * 「标题命中优先」排序、空关键词、以及热门关键词聚合(复用 seoKeywords)。
 * 有意不搜正文(见服务层注释),因此这里也不断言正文命中。
 */

let prisma: typeof import("@/lib/db")["prisma"];
let searchPublished: typeof import("@/server/content")["searchPublished"];
let getPopularKeywords: typeof import("@/server/content")["getPopularKeywords"];

let catArticle: { id: number };
let catProduct: { id: number };
let catHidden: { id: number };

const mk = (
  slug: string,
  categoryId: number,
  title: string,
  summary: string,
  opts: { status?: string; keywords?: string; publishAt?: string; body?: string } = {}
) =>
  prisma.content.create({
    data: {
      slug,
      categoryId,
      status: opts.status ?? "PUBLISHED",
      authorName: "搜索测试",
      publishAt: opts.publishAt ? new Date(opts.publishAt) : new Date("2026-09-01T00:00:00Z"),
      translations: {
        create: {
          locale: "zh-CN",
          title,
          summary,
          body: opts.body ?? "<p>正文内容</p>",
          seoKeywords: opts.keywords ?? null,
        },
      },
    },
  });

beforeAll(async () => {
  ({ prisma } = await import("@/lib/db"));
  ({ searchPublished, getPopularKeywords } = await import("@/server/content"));
  await prisma.content.deleteMany({ where: { slug: { startsWith: "v472s-" } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: "v472s-" } } });

  catArticle = await prisma.category.create({
    data: {
      slug: "v472s-article",
      moduleType: "article",
      visible: true,
      translations: { create: { locale: "zh-CN", name: "酒业洞察栏目" } },
    },
  });
  catProduct = await prisma.category.create({
    data: {
      slug: "v472s-product",
      moduleType: "product",
      visible: true,
      translations: { create: { locale: "zh-CN", name: "解决方案商城" } },
    },
  });
  catHidden = await prisma.category.create({
    data: {
      slug: "v472s-hidden",
      moduleType: "article",
      visible: false,
      translations: { create: { locale: "zh-CN", name: "隐藏栏目" } },
    },
  });

  // 标题命中(较旧)
  await mk("v472s-a", catArticle.id, "即时零售增长实战", "摘要甲", { publishAt: "2026-08-01T00:00:00Z", keywords: "即时零售,私域" });
  // 摘要命中(较新)—— 排序上应排在标题命中之后
  await mk("v472s-b", catArticle.id, "渠道压货的另一面", "聊聊即时零售的坑", { publishAt: "2026-09-10T00:00:00Z", keywords: "即时零售" });
  // 商品:标题命中
  await mk("v472s-c", catProduct.id, "即时零售 SaaS 套餐", "商品摘要", { keywords: "私域,一物一码" });
  // 未发布:不应命中
  await mk("v472s-draft", catArticle.id, "即时零售草稿", "草稿摘要", { status: "DRAFT" });
  // 不可见栏目:不应命中
  await mk("v472s-hidden-c", catHidden.id, "即时零售隐藏内容", "隐藏摘要");
  // 仅正文命中(有意不搜正文 → 不应命中)
  await mk("v472s-body", catArticle.id, "完全无关的标题", "完全无关的摘要", { body: "<p>这里才提到即时零售</p>" });
  // 栏目名命中
  await mk("v472s-cat", catArticle.id, "另一个标题", "另一个摘要");
});

describe("searchPublished 站内搜索(V4.7.2)", () => {
  it("标题与摘要都能命中,且标题命中排在前面", async () => {
    const r = await searchPublished("zh-CN", "即时零售");
    const slugs = r.items.map((i) => i.slug);
    expect(slugs).toContain("v472s-a");
    expect(slugs).toContain("v472s-b");
    // 标题命中优先:哪怕 b 的发布时间更新,也应排在标题命中的 a 之后
    expect(slugs.indexOf("v472s-a")).toBeLessThan(slugs.indexOf("v472s-b"));
  });

  it("排除未发布内容与不可见栏目的内容", async () => {
    const r = await searchPublished("zh-CN", "即时零售");
    const slugs = r.items.map((i) => i.slug);
    expect(slugs).not.toContain("v472s-draft");
    expect(slugs).not.toContain("v472s-hidden-c");
  });

  it("有意不搜正文(仅正文命中的条目不出现)", async () => {
    const r = await searchPublished("zh-CN", "即时零售");
    expect(r.items.map((i) => i.slug)).not.toContain("v472s-body");
  });

  it("关键词(seoKeywords)也参与匹配:详情页关键词 chip 跳搜索不会查无结果", async () => {
    // v472s-a 的 seoKeywords = 「即时零售,私域」,但标题/摘要里没有「私域」
    const r = await searchPublished("zh-CN", "私域");
    expect(r.items.map((i) => i.slug)).toContain("v472s-a");
  });

  it("按栏目名也能命中(搜「酒业洞察」列出该栏目内容)", async () => {
    const r = await searchPublished("zh-CN", "酒业洞察");
    expect(r.items.map((i) => i.slug)).toContain("v472s-cat");
  });

  it("类型过滤:product 只返回商品,article 不含商品", async () => {
    const onlyProduct = await searchPublished("zh-CN", "即时零售", { type: "product" });
    expect(onlyProduct.items.map((i) => i.slug)).toEqual(["v472s-c"]);

    const onlyArticle = await searchPublished("zh-CN", "即时零售", { type: "article" });
    expect(onlyArticle.items.map((i) => i.slug)).not.toContain("v472s-c");
  });

  it("分页:pageSize 生效且 total 为过滤后的总数", async () => {
    const p1 = await searchPublished("zh-CN", "即时零售", { pageSize: 1, page: 1 });
    const p2 = await searchPublished("zh-CN", "即时零售", { pageSize: 1, page: 2 });
    expect(p1.items).toHaveLength(1);
    expect(p2.items).toHaveLength(1);
    expect(p1.items[0].slug).not.toBe(p2.items[0].slug);
    expect(p1.total).toBeGreaterThanOrEqual(3);
  });

  it("空关键词返回空集(不返回全部内容)", async () => {
    const r = await searchPublished("zh-CN", "   ");
    expect(r.total).toBe(0);
    expect(r.items).toEqual([]);
  });

  it("结果携带卡片所需字段(标题/摘要/作者/栏目名/类型)", async () => {
    const r = await searchPublished("zh-CN", "即时零售");
    const hit = r.items.find((i) => i.slug === "v472s-a");
    expect(hit).toMatchObject({
      title: "即时零售增长实战",
      summary: "摘要甲",
      authorName: "搜索测试",
      categoryName: "酒业洞察栏目",
      moduleType: "article",
      titleHit: true,
    });
  });
});

describe("getPopularKeywords 热门关键词(V4.7.2)", () => {
  it("按 seoKeywords 出现频次排序聚合", async () => {
    const ks = await getPopularKeywords("zh-CN", 20);
    // 「即时零售」出现 2 次,应排在只出现 1 次的「一物一码」之前
    expect(ks).toContain("即时零售");
    expect(ks.indexOf("即时零售")).toBeLessThan(ks.indexOf("一物一码"));
  });
});
