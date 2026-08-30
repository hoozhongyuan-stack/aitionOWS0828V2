import { beforeAll, describe, expect, it } from "vitest";

/**
 * TEST-001(对应 AC-001 / REQ-001):商品 gallery/specs 数据层。
 * - 后台保存链路(saveContent)持久化 gallery/specs,回读与保存内容一致(有序)
 * - 非法 JSON 读出容错为空数组,不抛错(AC-021)
 * - listForLlms 返回 moduleType(为 Wave 3 llms.txt 商品分区预备数据)
 *
 * 数据库:全局临时 SQLite(tests/setup/db.ts),测试内自行 seed。
 */

let prisma: typeof import("@/lib/db")["prisma"];
let content: typeof import("@/server/content");

beforeAll(async () => {
  ({ prisma } = await import("@/lib/db"));
  content = await import("@/server/content");

  // seed:product 栏目(两级,验证 llms moduleType 用)
  const cat = await prisma.category.create({
    data: {
      slug: "prod-cat",
      moduleType: "product",
      translations: { create: { locale: "zh-CN", name: "产品中心" } },
    },
  });
  // 两条已发布内容:一条带 gallery/specs,一条不带(验证空值语义)
  await content.saveContent({
    slug: "product-with-data",
    categoryId: cat.id,
    status: "PUBLISHED",
    authorName: "管理员",
    coverUrl: "/uploads/cover.webp",
    publishAt: null,
    gallery: ["/uploads/a.webp", "/uploads/b.webp", "/uploads/c.webp"],
    specs: [
      { k: "型号", v: "AX-100" },
      { k: "材质", v: "铝合金" },
    ],
    translations: [
      {
        locale: "zh-CN",
        title: "旗舰商品",
        body: "<p>正文</p>",
        seoTitle: "旗舰商品 SEO 标题",
        seoKeywords: "商品,旗舰",
        seoDesc: "旗舰商品描述",
      },
    ],
  });
  await content.saveContent({
    slug: "product-plain",
    categoryId: cat.id,
    status: "PUBLISHED",
    authorName: "管理员",
    coverUrl: null,
    publishAt: null,
    translations: [{ locale: "zh-CN", title: "普通商品", body: "<p>正文</p>" }],
  });
});

describe("TEST-001:商品 gallery/specs 服务层保存与回读一致", () => {
  it("saveContent 保存后,库内 JSON 串与详情层解析回读一致且有序", async () => {
    const row = await prisma.content.findUnique({ where: { slug: "product-with-data" } });
    expect(row).toBeTruthy();
    // 库内存储为 JSON 字符串
    expect(JSON.parse(row!.gallery!)).toEqual([
      "/uploads/a.webp",
      "/uploads/b.webp",
      "/uploads/c.webp",
    ]);
    expect(JSON.parse(row!.specs!)).toEqual([
      { k: "型号", v: "AX-100" },
      { k: "材质", v: "铝合金" },
    ]);

    // 服务层回读解析一致(顺序保持)
    const detail = await content.getProductDetail("product-with-data", "zh-CN");
    expect(detail?.gallery).toEqual([
      { url: "/uploads/a.webp" },
      { url: "/uploads/b.webp" },
      { url: "/uploads/c.webp" },
    ]);
    expect(detail?.specs).toEqual([
      { k: "型号", v: "AX-100" },
      { k: "材质", v: "铝合金" },
    ]);
  });

  it("未传/空数组时存 null,读出为空数组(不污染非商品内容)", async () => {
    const row = await prisma.content.findUnique({ where: { slug: "product-plain" } });
    expect(row?.gallery).toBeNull();
    expect(row?.specs).toBeNull();
    const detail = await content.getProductDetail("product-plain", "zh-CN");
    expect(detail?.gallery).toEqual([]);
    expect(detail?.specs).toEqual([]);
  });

  it("非法 JSON 读出容错为空数组且不抛错(AC-021)", async () => {
    // 直接写脏数据(模拟历史脏数据/手工改库)
    await prisma.content.update({
      where: { slug: "product-with-data" },
      data: { gallery: "{oops-not-json", specs: "not-an-array" },
    });
    await expect(
      content.getProductDetail("product-with-data", "zh-CN")
    ).resolves.toMatchObject({ gallery: [], specs: [] });

    // 合法 JSON 但不是数组/元素结构不对,同样容错为空
    await prisma.content.update({
      where: { slug: "product-with-data" },
      data: { gallery: JSON.stringify({ url: "/x.webp" }), specs: JSON.stringify(["bad"]) },
    });
    await expect(
      content.getProductDetail("product-with-data", "zh-CN")
    ).resolves.toMatchObject({ gallery: [], specs: [] });
  });
});

describe("listForLlms 增加 moduleType(Wave 3 预备)", () => {
  it("每条返回值带所属栏目的 moduleType", async () => {
    const rows = await content.listForLlms("zh-CN");
    const target = rows.find((r) => r.slug === "product-with-data");
    expect(target?.moduleType).toBe("product");
  });
});
