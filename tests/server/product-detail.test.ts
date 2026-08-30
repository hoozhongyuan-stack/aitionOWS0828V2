import { beforeAll, describe, expect, it } from "vitest";

/**
 * TEST-002(对应 AC-002 / AC-021):商品详情数据组装——
 * 图集解析(封面兜底首位)、规格参数解析、单页 TDK、未发布返回 null。
 * TEST-003(对应 AC-002):询盘表单区块——formId 关联且表单 enabled 才返回数据,
 * 无表单/表单已停用返回 null(与 article 详情不校验 enabled 为有意差异)。
 */

let prisma: typeof import("@/lib/db")["prisma"];
let getProductDetail: typeof import("@/server/content")["getProductDetail"];

const FORM_FIELDS = [{ id: "name", type: "text", label: "姓名", required: true }];

beforeAll(async () => {
  ({ prisma } = await import("@/lib/db"));
  ({ getProductDetail } = await import("@/server/content"));

  // seed:product 栏目 + 一组覆盖各分支的商品
  const cat = await prisma.category.create({
    data: {
      slug: "detail-cat",
      moduleType: "product",
      translations: { create: { locale: "zh-CN", name: "详情测试栏目" } },
    },
  });
  const enabledForm = await prisma.form.create({
    data: { name: "在线询盘", slug: "inquiry-on", schema: JSON.stringify(FORM_FIELDS), enabled: true },
  });
  const disabledForm = await prisma.form.create({
    data: { name: "已停用表单", slug: "inquiry-off", schema: JSON.stringify(FORM_FIELDS), enabled: false },
  });

  const mk = (slug: string, extra: Record<string, unknown>) =>
    prisma.content.create({
      data: {
        slug,
        categoryId: cat.id,
        status: "PUBLISHED",
        authorName: "测试作者",
        publishAt: new Date("2026-08-01T00:00:00Z"),
        translations: {
          create: {
            locale: "zh-CN",
            title: `商品-${slug}`,
            summary: "摘要",
            body: "<p>商品正文</p>",
            seoTitle: `${slug} 的 SEO 标题`,
            seoKeywords: "k1,k2",
            seoDesc: "SEO 描述",
          },
        },
        ...extra,
      },
    });

  // 完整商品:gallery + specs + 启用表单
  await mk("full-product", {
    coverUrl: "/uploads/cover.webp",
    gallery: JSON.stringify(["/uploads/g1.webp", "/uploads/g2.webp"]),
    specs: JSON.stringify([
      { k: "型号", v: "AX-100" },
      { k: "重量", v: "2kg" },
    ]),
    formId: enabledForm.id,
  });
  // 无图集:封面兜底首位;表单已停用
  await mk("no-gallery-product", {
    coverUrl: "/uploads/cover-only.webp",
    gallery: null,
    specs: null,
    formId: disabledForm.id,
  });
  // 无表单、图集为非法 JSON
  await mk("broken-json-product", {
    coverUrl: "/uploads/broken.webp",
    gallery: "{oops",
    specs: "]]]bad",
    formId: null,
  });
  // 合法 JSON 但非数组结构(AC-021 容错:按空处理,不抛错、不封面兜底)
  await mk("non-array-json-product", {
    coverUrl: "/uploads/non-array.webp",
    gallery: JSON.stringify({ not: "array" }),
    specs: JSON.stringify({ k: "v" }),
    formId: null,
  });
  // 无封面、无图集:无兜底来源 → 空图集
  await mk("no-cover-product", {
    coverUrl: null,
    gallery: null,
    specs: null,
    formId: null,
  });
  // 未发布(草稿)
  await prisma.content.create({
    data: {
      slug: "draft-product",
      categoryId: cat.id,
      status: "DRAFT",
      authorName: "测试作者",
      translations: { create: { locale: "zh-CN", title: "草稿商品", body: "<p>x</p>" } },
    },
  });
});

describe("TEST-002:商品详情数据组装(图集/参数/TDK)", () => {
  it("图集按序解析为 {url} 数组,规格参数解析为键值数组,TDK 取自翻译", async () => {
    const d = await getProductDetail("full-product", "zh-CN");
    expect(d).toBeTruthy();
    expect(d!.gallery).toEqual([{ url: "/uploads/g1.webp" }, { url: "/uploads/g2.webp" }]);
    expect(d!.specs).toEqual([
      { k: "型号", v: "AX-100" },
      { k: "重量", v: "2kg" },
    ]);
    expect(d!.title).toBe("商品-full-product");
    expect(d!.body).toBe("<p>商品正文</p>");
    expect(d!.seoTitle).toBe("full-product 的 SEO 标题");
    expect(d!.seoKeywords).toBe("k1,k2");
    expect(d!.seoDesc).toBe("SEO 描述");
    expect(d!.category).toMatchObject({ slug: "detail-cat", moduleType: "product" });
  });

  it("图集缺失/为空时封面兜底插到首位;非法 JSON 容错为空数组不抛错", async () => {
    // 无图集 → 封面兜底
    const noGallery = await getProductDetail("no-gallery-product", "zh-CN");
    expect(noGallery!.gallery).toEqual([{ url: "/uploads/cover-only.webp" }]);
    expect(noGallery!.specs).toEqual([]);
    // 非法 JSON → 空数组(不抛错)
    const broken = await getProductDetail("broken-json-product", "zh-CN");
    expect(broken!.gallery).toEqual([]);
    expect(broken!.specs).toEqual([]);
  });

  it("AC-021 容错补充:合法 JSON 非数组按空返回且不做封面兜底;无封面无图集 → 空图集", async () => {
    // 合法 JSON 但非数组:invalid=true → 按空图集返回,即使有封面也不兜底
    const nonArray = await getProductDetail("non-array-json-product", "zh-CN");
    expect(nonArray).toBeTruthy();
    expect(nonArray!.gallery).toEqual([]);
    expect(nonArray!.specs).toEqual([]);
    // 无封面且无图集:无兜底来源 → 空图集(不抛错)
    const noCover = await getProductDetail("no-cover-product", "zh-CN");
    expect(noCover).toBeTruthy();
    expect(noCover!.gallery).toEqual([]);
    expect(noCover!.specs).toEqual([]);
  });

  it("未发布(草稿)商品返回 null", async () => {
    await expect(getProductDetail("draft-product", "zh-CN")).resolves.toBeNull();
    await expect(getProductDetail("not-exist", "zh-CN")).resolves.toBeNull();
  });
});

describe("TEST-003:询盘表单区块数据(formId → 启用表单才返回)", () => {
  it("关联启用中的表单 → 返回表单数据(slug/name/fields)", async () => {
    const d = await getProductDetail("full-product", "zh-CN");
    expect(d!.inquiryForm).toBeTruthy();
    expect(d!.inquiryForm).toMatchObject({ slug: "inquiry-on", name: "在线询盘" });
    expect(d!.inquiryForm!.fields).toEqual(FORM_FIELDS);
  });

  it("关联表单已停用 → 返回 null(与 article 不校验 enabled 为有意差异)", async () => {
    const d = await getProductDetail("no-gallery-product", "zh-CN");
    expect(d!.inquiryForm).toBeNull();
  });

  it("未关联表单 → 返回 null", async () => {
    const d = await getProductDetail("broken-json-product", "zh-CN");
    expect(d!.inquiryForm).toBeNull();
  });
});
