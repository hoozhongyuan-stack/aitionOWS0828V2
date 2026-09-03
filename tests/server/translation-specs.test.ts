import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * TEST-101(对应 AC-001 / REQ-001):specs 多语言读取兜底链——
 *   当前语言 translation.specs → Content.specs(主表兜底列)→ 空表(容错)。
 * TEST-102(对应 AC-002 / REQ-001):写入语义矩阵——
 *   translations[].specs 显式数组=该语言值(空数组→NULL)/ null=该语言无规格 /
 *   undefined(缺省)=保留既有(服务层 deleteMany+recreate 前快照回填);
 *   顶层 specs 仅写 Content.specs,不得隐式改写任何翻译行。
 * TASK-106 扩展:编辑器全量往返载荷形状(每语言 Tab 独立 specs + 默认语言 Tab 同步顶层)。
 *
 * 管理员守卫打桩(API 层用例只验证保存链路,不测登录)。
 */

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...actual,
    requireAdmin: async () => ({ admin: { id: 1, name: "tester" } }),
  };
});

let prisma: typeof import("@/lib/db")["prisma"];
let getProductDetail: typeof import("@/server/content")["getProductDetail"];
let getContentForEdit: typeof import("@/server/content")["getContentForEdit"];
let saveContent: typeof import("@/server/content")["saveContent"];
let PUT: typeof import("@/app/api/admin/contents/route")["PUT"];

const ZH_SPECS = [
  { k: "型号", v: "AX-100" },
  { k: "重量", v: "2kg" },
];
const EN_SPECS = [
  { k: "Model", v: "AX-100" },
  { k: "Weight", v: "2kg" },
];
const EN_SPECS_V2 = [
  { k: "Model", v: "AX-200" },
  { k: "Material", v: "Alloy" },
];

let categoryId: number;
let idEnHasSpecs = 0;
let idEnNullSpecs = 0;
let idNoEnRow = 0;
let idBrokenEn = 0;

/** 通过服务层建内容(与后台保存同链路),返回内容 id */
async function mkContent(
  slug: string,
  opts: {
    mainSpecs?: unknown;
    zhSpecs?: unknown;
    enSpecs?: unknown;
  } = {}
): Promise<number> {
  const created = await saveContent({
    slug,
    categoryId,
    status: "PUBLISHED",
    authorName: "测试作者",
    coverUrl: null,
    publishAt: null,
    ...(opts.mainSpecs !== undefined ? { specs: opts.mainSpecs as never } : {}),
    translations: [
      {
        locale: "zh-CN",
        title: `规格商品-${slug}`,
        body: "<p>中文正文</p>",
        ...(opts.zhSpecs !== undefined ? { specs: opts.zhSpecs as never } : {}),
      },
      ...(opts.enSpecs !== undefined
        ? [
            {
              locale: "en",
              title: `Spec Product-${slug}`,
              body: "<p>english body</p>",
              specs: opts.enSpecs as never,
            },
          ]
        : []),
    ],
  } as never);
  return created.id;
}

beforeAll(async () => {
  ({ prisma } = await import("@/lib/db"));
  ({ getProductDetail, getContentForEdit, saveContent } = await import("@/server/content"));
  ({ PUT } = await import("@/app/api/admin/contents/route"));

  const cat = await prisma.category.create({
    data: {
      slug: "spec-i18n-cat",
      moduleType: "product",
      translations: { create: { locale: "zh-CN", name: "多语言规格栏目" } },
    },
  });
  categoryId = cat.id;

  // 1) en 行已维护英文 specs(模拟编辑器保存/数据运营完成)
  idEnHasSpecs = await mkContent("spec-en-has-specs", {
    mainSpecs: ZH_SPECS,
    zhSpecs: ZH_SPECS,
    enSpecs: EN_SPECS,
  });
  // 2) en 行存在但 specs=NULL(模拟「该语言无规格」显式清空)
  idEnNullSpecs = await mkContent("spec-en-null", {
    mainSpecs: ZH_SPECS,
    zhSpecs: ZH_SPECS,
    enSpecs: null,
  });
  // 3) en 行不存在(仅 zh 行)
  idNoEnRow = await mkContent("spec-no-en-row", { mainSpecs: ZH_SPECS, zhSpecs: ZH_SPECS });
  // 4) en 行 specs 为非法 JSON(容错路径;先建合法值,再直接修库置脏串)
  idBrokenEn = await mkContent("spec-en-broken", {
    mainSpecs: ZH_SPECS,
    zhSpecs: ZH_SPECS,
    enSpecs: EN_SPECS,
  });
  // 直接修库把 en 行 specs 置为非法串(服务层入参是数组,绕过序列化模拟脏数据)
  await prisma.contentTranslation.updateMany({
    where: { contentId: idBrokenEn, locale: "en" },
    data: { specs: "]]]bad" },
  });
});

// ---------------- TEST-101:读取兜底链 ----------------

describe("TEST-101:详情读取兜底链(translation.specs → Content.specs → 空表)", () => {
  it("en 翻译行维护了英文 specs → /en 详情返回英文 specs;zh-CN 详情保持中文", async () => {
    const en = await getProductDetail("spec-en-has-specs", "en");
    expect(en).toBeTruthy();
    expect(en!.specs).toEqual(EN_SPECS);
    const zh = await getProductDetail("spec-en-has-specs", "zh-CN");
    expect(zh!.specs).toEqual(ZH_SPECS);
  });

  it("en 行 specs=NULL → 回退主表 specs(兜底列)", async () => {
    const en = await getProductDetail("spec-en-null", "en");
    expect(en!.specs).toEqual(ZH_SPECS);
  });

  it("en 行不存在 → 回退主表 specs(经首个可用翻译行兜底)", async () => {
    const en = await getProductDetail("spec-no-en-row", "en");
    expect(en!.specs).toEqual(ZH_SPECS);
  });

  it("翻译行 specs 非法 JSON → 容错为空数组,不抛错、不回退主表", async () => {
    const en = await getProductDetail("spec-en-broken", "en");
    expect(en!.specs).toEqual([]);
  });

  it("主表与翻译行均无 specs → 空数组", async () => {
    const id = await mkContent("spec-all-empty", { mainSpecs: [], zhSpecs: [], enSpecs: [] });
    const row = await prisma.content.findUnique({ where: { id }, select: { slug: true } });
    const d = await getProductDetail(row!.slug, "en");
    expect(d!.specs).toEqual([]);
  });
});

// ---------------- TEST-102:编辑数据回显 + 写入语义矩阵 ----------------

describe("TEST-102:编辑回显与写入语义矩阵(全量往返/快照回填/顶层仅兜底列)", () => {
  it("getContentForEdit 按语言返回解析后的 specs 数组(NULL 容错为 [])", async () => {
    const edit = await getContentForEdit(idEnHasSpecs);
    expect(edit).toBeTruthy();
    const zh = edit!.translations.find((t) => t.locale === "zh-CN");
    const en = edit!.translations.find((t) => t.locale === "en");
    expect(zh!.specs).toEqual(ZH_SPECS);
    expect(en!.specs).toEqual(EN_SPECS);

    const nullRow = await getContentForEdit(idEnNullSpecs);
    expect(nullRow!.translations.find((t) => t.locale === "en")!.specs).toEqual([]);
  });

  it("全量往返:en Tab 改动持久化,zh 行与主表 specs 不受影响", async () => {
    // 首建:zh/en 各自 specs + 顶层=zh(编辑器默认语言 Tab 同步语义)
    const created = await saveContent({
      slug: "spec-roundtrip",
      categoryId,
      status: "PUBLISHED",
      authorName: "测试作者",
      coverUrl: null,
      publishAt: null,
      specs: ZH_SPECS,
      translations: [
        { locale: "zh-CN", title: "往返商品", body: "<p>x</p>", specs: ZH_SPECS },
        { locale: "en", title: "Roundtrip", body: "<p>y</p>", specs: EN_SPECS },
      ],
    } as never);
    // 再存:en Tab 改为 EN_SPECS_V2,zh Tab 原样全量往返,顶层不变
    await saveContent({
      id: created.id,
      slug: "spec-roundtrip",
      categoryId,
      status: "PUBLISHED",
      authorName: "测试作者",
      coverUrl: null,
      publishAt: null,
      specs: ZH_SPECS,
      translations: [
        { locale: "zh-CN", title: "往返商品", body: "<p>x</p>", specs: ZH_SPECS },
        { locale: "en", title: "Roundtrip", body: "<p>y</p>", specs: EN_SPECS_V2 },
      ],
    } as never);

    const rows = await prisma.contentTranslation.findMany({
      where: { contentId: created.id },
    });
    expect(rows.find((t) => t.locale === "en")!.specs).toBe(JSON.stringify(EN_SPECS_V2));
    expect(rows.find((t) => t.locale === "zh-CN")!.specs).toBe(JSON.stringify(ZH_SPECS));
    const main = await prisma.content.findUnique({ where: { id: created.id } });
    expect(main!.specs).toBe(JSON.stringify(ZH_SPECS));

    // 重新打开编辑:en 读到改动后的英文 specs
    const edit = await getContentForEdit(created.id);
    expect(edit!.translations.find((t) => t.locale === "en")!.specs).toEqual(EN_SPECS_V2);
  });

  it("仅顶层 specs 变更(翻译行 specs 缺省)→ Content.specs 更新且各翻译行不被改写", async () => {
    const created = await saveContent({
      slug: "spec-toplevel-only",
      categoryId,
      status: "PUBLISHED",
      authorName: "测试作者",
      coverUrl: null,
      publishAt: null,
      specs: ZH_SPECS,
      translations: [
        { locale: "zh-CN", title: "顶层商品", body: "<p>x</p>", specs: ZH_SPECS },
        { locale: "en", title: "Top Only", body: "<p>y</p>", specs: EN_SPECS },
      ],
    } as never);
    // 仅变更顶层 specs;translations 不带 specs 字段(undefined=保留既有)
    await saveContent({
      id: created.id,
      slug: "spec-toplevel-only",
      categoryId,
      status: "PUBLISHED",
      authorName: "测试作者",
      coverUrl: null,
      publishAt: null,
      specs: [{ k: "型号", v: "AX-999" }],
      translations: [
        { locale: "zh-CN", title: "顶层商品", body: "<p>x</p>" },
        { locale: "en", title: "Top Only", body: "<p>y</p>" },
      ],
    } as never);

    const main = await prisma.content.findUnique({ where: { id: created.id } });
    expect(main!.specs).toBe(JSON.stringify([{ k: "型号", v: "AX-999" }]));
    const rows = await prisma.contentTranslation.findMany({ where: { contentId: created.id } });
    expect(rows.find((t) => t.locale === "zh-CN")!.specs).toBe(JSON.stringify(ZH_SPECS));
    expect(rows.find((t) => t.locale === "en")!.specs).toBe(JSON.stringify(EN_SPECS));
  });

  it("translations[].specs=null → 该行写 NULL;显式空数组同样存 NULL", async () => {
    const created = await saveContent({
      slug: "spec-null-write",
      categoryId,
      status: "PUBLISHED",
      authorName: "测试作者",
      coverUrl: null,
      publishAt: null,
      specs: ZH_SPECS,
      translations: [
        { locale: "zh-CN", title: "空值商品", body: "<p>x</p>", specs: ZH_SPECS },
        { locale: "en", title: "Null Write", body: "<p>y</p>", specs: EN_SPECS },
      ],
    } as never);
    await saveContent({
      id: created.id,
      slug: "spec-null-write",
      categoryId,
      status: "PUBLISHED",
      authorName: "测试作者",
      coverUrl: null,
      publishAt: null,
      translations: [
        { locale: "zh-CN", title: "空值商品", body: "<p>x</p>", specs: ZH_SPECS },
        { locale: "en", title: "Null Write", body: "<p>y</p>", specs: null },
      ],
    } as never);
    let rows = await prisma.contentTranslation.findMany({ where: { contentId: created.id } });
    expect(rows.find((t) => t.locale === "en")!.specs).toBeNull();
    expect(rows.find((t) => t.locale === "zh-CN")!.specs).toBe(JSON.stringify(ZH_SPECS));

    // 显式空数组 → 序列化为 NULL(与顶层「空数组存 null」语义一致)
    await saveContent({
      id: created.id,
      slug: "spec-null-write",
      categoryId,
      status: "PUBLISHED",
      authorName: "测试作者",
      coverUrl: null,
      publishAt: null,
      translations: [
        { locale: "zh-CN", title: "空值商品", body: "<p>x</p>", specs: ZH_SPECS },
        { locale: "en", title: "Null Write", body: "<p>y</p>", specs: [] },
      ],
    } as never);
    rows = await prisma.contentTranslation.findMany({ where: { contentId: created.id } });
    expect(rows.find((t) => t.locale === "en")!.specs).toBeNull();

    // 编辑回显:NULL 行解析为 []
    const edit = await getContentForEdit(created.id);
    expect(edit!.translations.find((t) => t.locale === "en")!.specs).toEqual([]);
  });

  it("翻译行 specs 超 50 行 → 拒绝保存", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({ k: `k${i}`, v: "v" }));
    await expect(
      saveContent({
        slug: "spec-overflow-trans",
        categoryId,
        status: "PUBLISHED",
        authorName: "测试作者",
        coverUrl: null,
        publishAt: null,
        translations: [{ locale: "zh-CN", title: "超限", body: "<p>x</p>", specs: rows }],
      } as never)
    ).rejects.toThrow(/50/);
  });
});

// ---------------- TASK-102 API 层 + TASK-106 编辑器载荷形状 ----------------

describe("TEST-102 API:PUT 接受 translations[].specs 并持久化", () => {
  function putReq(body: unknown): Request {
    return new Request("http://localhost/api/admin/contents", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("PUT 携带 translations[].specs(数组/null 混合)保存成功,库内值一致", async () => {
    const res = await PUT(
      putReq({
        slug: "api-trans-specs",
        categoryId,
        status: "PUBLISHED",
        authorName: "管理员",
        coverUrl: null,
        publishAt: null,
        specs: ZH_SPECS,
        translations: [
          { locale: "zh-CN", title: "API 商品", body: "<p>x</p>", specs: ZH_SPECS },
          { locale: "en", title: "API Product", body: "<p>y</p>", specs: EN_SPECS },
          { locale: "ja", title: "API 商品", body: "<p>z</p>", specs: null },
        ],
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);

    const content = await prisma.content.findUnique({
      where: { slug: "api-trans-specs" },
      include: { translations: true },
    });
    expect(content).toBeTruthy();
    expect(content!.specs).toBe(JSON.stringify(ZH_SPECS));
    expect(content!.translations.find((t) => t.locale === "zh-CN")!.specs).toBe(
      JSON.stringify(ZH_SPECS)
    );
    expect(content!.translations.find((t) => t.locale === "en")!.specs).toBe(
      JSON.stringify(EN_SPECS)
    );
    expect(content!.translations.find((t) => t.locale === "ja")!.specs).toBeNull();
  });

  it("TASK-106 编辑器全量往返载荷形状:每语言 Tab specs 独立提交,顶层=默认语言 Tab", async () => {
    // 首建
    const created = await saveContent({
      slug: "editor-roundtrip",
      categoryId,
      status: "PUBLISHED",
      authorName: "管理员",
      coverUrl: null,
      publishAt: null,
      specs: ZH_SPECS,
      translations: [
        { locale: "zh-CN", title: "编辑器商品", body: "<p>x</p>", specs: ZH_SPECS },
        { locale: "en", title: "Editor Product", body: "<p>y</p>", specs: EN_SPECS },
      ],
    } as never);
    // 模拟编辑器保存载荷:zh Tab 原样、en Tab 修改、顶层 specs=zh Tab(默认语言同步)
    const res = await PUT(
      putReq({
        id: created.id,
        slug: "editor-roundtrip",
        categoryId,
        status: "PUBLISHED",
        authorName: "管理员",
        coverUrl: null,
        publishAt: null,
        specs: ZH_SPECS,
        translations: [
          { locale: "zh-CN", title: "编辑器商品", body: "<p>x</p>", specs: ZH_SPECS },
          {
            locale: "en",
            title: "Editor Product",
            body: "<p>y</p>",
            specs: [{ k: "Model", v: "AX-300" }],
          },
        ],
      })
    );
    expect(res.status).toBe(200);
    const rows = await prisma.contentTranslation.findMany({
      where: { contentId: created.id },
    });
    expect(rows.find((t) => t.locale === "en")!.specs).toBe(
      JSON.stringify([{ k: "Model", v: "AX-300" }])
    );
    expect(rows.find((t) => t.locale === "zh-CN")!.specs).toBe(JSON.stringify(ZH_SPECS));
    const main = await prisma.content.findUnique({ where: { id: created.id } });
    expect(main!.specs).toBe(JSON.stringify(ZH_SPECS));
  });
});
