import { beforeAll, describe, expect, it } from "vitest";

/**
 * TEST-005(对应 AC-004 / REQ-003):栏目列表按栏目及其全部后代栏目过滤——
 * 父商品栏目页数据包含所有子/孙栏目商品(二级分类浏览的数据基础)。
 * TEST-018(对应 AC-016 / NFR-006):列表返回条目不得包含 gallery/specs 键
 * (查询投影排除,详情页才读取)。
 */

let prisma: typeof import("@/lib/db")["prisma"];
let listPublishedByCategory: typeof import("@/server/content")["listPublishedByCategory"];

beforeAll(async () => {
  ({ prisma } = await import("@/lib/db"));
  ({ listPublishedByCategory } = await import("@/server/content"));

  // seed:商品栏目树 prod-root → (prod-child-a → prod-grand-a, prod-child-b, prod-child-hidden)
  //       另建一个 news 栏目作对照(非 product 行为不变)
  const mkCat = (slug: string, moduleType: string, parentId: number | null, visible = true) =>
    prisma.category.create({
      data: {
        slug,
        moduleType,
        parentId,
        visible,
        translations: { create: { locale: "zh-CN", name: slug } },
      },
    });

  const root = await mkCat("prod-root", "product", null);
  const childA = await mkCat("prod-child-a", "product", root.id);
  const childB = await mkCat("prod-child-b", "product", root.id);
  const grandA = await mkCat("prod-grand-a", "product", childA.id); // 三级:验证"全部后代"
  await mkCat("prod-child-hidden", "product", root.id, false); // 隐藏子栏目:内容不出现在父栏目页
  const news = await mkCat("news-cat", "news", null);

  const mkContent = (slug: string, categoryId: number, status = "PUBLISHED", extra: Record<string, unknown> = {}) =>
    prisma.content.create({
      data: {
        slug,
        categoryId,
        status,
        authorName: "作者",
        translations: { create: { locale: "zh-CN", title: slug, body: "<p>x</p>" } },
        ...extra,
      },
    });

  await mkContent("item-root", root.id);
  await mkContent("item-child-a", childA.id, "PUBLISHED", {
    // 带图集/参数:证明即便库里有数据,列表条目也不得含这两个键(TEST-018)
    gallery: JSON.stringify(["/uploads/x1.webp", "/uploads/x2.webp"]),
    specs: JSON.stringify([{ k: "型号", v: "X-1" }]),
  });
  await mkContent("item-child-b", childB.id);
  await mkContent("item-grand", grandA.id); // 孙栏目内容:旧实现(仅直接子级)会漏掉 → RED 依据
  await mkContent("item-draft", childA.id, "DRAFT"); // 未发布不出现
  await mkContent("item-hidden-cat", (await prisma.category.findUnique({ where: { slug: "prod-child-hidden" } }))!.id);
  await mkContent("article-1", news.id);
});

describe("TEST-005:栏目列表按栏目及全部后代栏目过滤", () => {
  it("父商品栏目页包含所有直接/孙代子栏目商品,不含隐藏子栏目、草稿与非本树内容", async () => {
    const data = await listPublishedByCategory("prod-root", "zh-CN");
    expect(data).toBeTruthy();
    const slugs = data!.items.map((i) => i.slug).sort();
    // root + child-a + child-b + grand(全部后代);不含 hidden/草稿/article
    expect(slugs).toEqual(["item-child-a", "item-child-b", "item-grand", "item-root"]);
    expect(data!.total).toBe(4);
  });

  it("子栏目页包含本栏目及其后代商品,不含兄弟/父栏目商品", async () => {
    const data = await listPublishedByCategory("prod-child-a", "zh-CN");
    const slugs = data!.items.map((i) => i.slug).sort();
    expect(slugs).toEqual(["item-child-a", "item-grand"]);
  });

  it("非 product 栏目列表行为不变(仅本栏目内容)", async () => {
    const data = await listPublishedByCategory("news-cat", "zh-CN");
    expect(data!.items.map((i) => i.slug)).toEqual(["article-1"]);
    expect(data!.category.moduleType).toBe("news");
  });

  it("保留分页参数语义(page/pageSize/total)", async () => {
    const page1 = await listPublishedByCategory("prod-root", "zh-CN", 1, 3);
    expect(page1!.total).toBe(4);
    expect(page1!.pageSize).toBe(3);
    expect(page1!.items).toHaveLength(3);
    const page2 = await listPublishedByCategory("prod-root", "zh-CN", 2, 3);
    expect(page2!.items).toHaveLength(1);
    // 两页拼起来不重不漏
    const all = [...page1!.items, ...page2!.items].map((i) => i.slug).sort();
    expect(all).toEqual(["item-child-a", "item-child-b", "item-grand", "item-root"]);
  });

  it("返回的 category 携带可见子栏目列表(父栏目页子分类页签的数据基础)", async () => {
    const data = await listPublishedByCategory("prod-root", "zh-CN");
    const childSlugs = data!.category.children!.map((c) => c.slug).sort();
    // 仅可见子栏目;隐藏栏目不出现
    expect(childSlugs).toEqual(["prod-child-a", "prod-child-b"]);
    expect(data!.category.children![0]).toHaveProperty("name");
  });

  it("不存在的栏目返回 null", async () => {
    await expect(listPublishedByCategory("no-such-cat", "zh-CN")).resolves.toBeNull();
  });
});

describe("TEST-018:列表条目不含 gallery/specs 键(NFR-006)", () => {
  it("即使库内内容带 gallery/specs 数据,返回条目也不含这两个键", async () => {
    const data = await listPublishedByCategory("prod-root", "zh-CN");
    for (const item of data!.items) {
      expect(item).not.toHaveProperty("gallery");
      expect(item).not.toHaveProperty("specs");
    }
    // 针对带图集数据的那条单独复核
    const withData = data!.items.find((i) => i.slug === "item-child-a");
    expect(withData).toBeTruthy();
    expect(Object.keys(withData!)).not.toContain("gallery");
    expect(Object.keys(withData!)).not.toContain("specs");
  });
});
