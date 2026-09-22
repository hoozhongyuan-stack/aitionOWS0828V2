import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

/**
 * 多语言封面图(V4.8.4)回归锁。
 *
 * 锁住:
 * - 写入三态(specs 同款):字符串=写入 / null=清空 / 缺省(undefined)=快照回填保留既有
 * - 读路径回退链:该语言 translation.coverUrl → 主表 coverUrl;中文页永远用主封面
 * - 存量兼容:翻译行无封面时所有出口与改动前一致
 * - API 层:PUT zod 不剥除 translations[].coverUrl;GET 回显(MCP {...prev} 往返的数据源)
 *
 * 管理员守卫打桩(API 层用例只验证字段贯通,不测登录)。
 */

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...actual,
    requirePerm: async () => ({ admin: { id: 1, name: "tester", role: "OWNER", permissions: [] } }),
  };
});

let db: PrismaClient;
let content: typeof import("@/server/content");
let product: typeof import("@/server/content/product");
let ugc: typeof import("@/server/ugc");
let categoryId = 0;
let productId = 0;
let userId = 0;
let seq = 0;
const slugOf = (name: string) => `v484-cover-${name}`;

/** 建一篇已发布内容(默认 zh 翻译;可选 en 翻译与主表封面) */
async function makeContent(
  name: string,
  opts: {
    coverUrl?: string | null;
    enTitle?: string | null;
    enCover?: string | null;
    categoryId?: number;
  } = {}
) {
  seq += 1;
  return db.content.create({
    data: {
      slug: slugOf(`${name}-${seq}`),
      categoryId: opts.categoryId ?? categoryId,
      status: "PUBLISHED",
      authorName: "封面测试",
      publishAt: null,
      coverUrl: opts.coverUrl ?? null,
      translations: {
        create: [
          { locale: "zh-CN", title: `封面测试中文 ${seq}`, body: "<p>x</p>" },
          ...(opts.enTitle !== null
            ? [
                {
                  locale: "en",
                  title: opts.enTitle ?? `Cover test ${seq}`,
                  body: "<p>x</p>",
                  ...(opts.enCover !== undefined ? { coverUrl: opts.enCover } : {}),
                },
              ]
            : []),
        ],
      },
    },
  });
}

beforeAll(async () => {
  content = await import("@/server/content");
  product = await import("@/server/content/product");
  ugc = await import("@/server/ugc");
  db = (await import("@/lib/db")).prisma;
  const cat = await db.category.create({
    data: {
      slug: "v484-cover-cat",
      moduleType: "article",
      visible: true,
      sort: 1,
      translations: { create: { locale: "zh-CN", name: "封面测试栏目" } },
    },
  });
  categoryId = cat.id;
  const prodCat = await db.category.create({
    data: {
      slug: "v484-cover-prod-cat",
      moduleType: "product",
      visible: true,
      sort: 1,
      translations: { create: { locale: "zh-CN", name: "封面测试商品栏目" } },
    },
  });
  productId = prodCat.id;
  const user = await db.user.create({ data: { nickname: "封面测试用户" } });
  userId = user.id;
});

afterAll(async () => {
  // 就地清理,避免污染同进程其他测试文件的列表/搜索断言
  const ids = (
    await db.content.findMany({
      where: { slug: { startsWith: "v484-cover-" } },
      select: { id: true },
    })
  ).map((c) => c.id);
  await db.favorite.deleteMany({ where: { targetType: "CONTENT", targetId: { in: ids } } });
  await db.content.deleteMany({ where: { id: { in: ids } } });
  await db.category.deleteMany({ where: { slug: { startsWith: "v484-cover-" } } });
  await db.user.deleteMany({ where: { id: userId } });
});

describe("saveContent 翻译行封面三态写入(V4.8.4)", () => {
  it("字符串=写入;新建后 en 翻译行落封面", async () => {
    const c = await content.saveContent({
      slug: slugOf(`write-${++seq}`),
      categoryId,
      status: "PUBLISHED",
      authorName: "封面测试",
      publishAt: null,
      coverUrl: "/uploads/zh-main.webp",
      translations: [
        { locale: "zh-CN", title: "中文标题", body: "<p>x</p>" },
        { locale: "en", title: "EN title", body: "<p>x</p>", coverUrl: "/uploads/en-cover.webp" },
      ],
    });
    const rows = await db.contentTranslation.findMany({ where: { contentId: c.id } });
    const en = rows.find((r) => r.locale === "en");
    const zh = rows.find((r) => r.locale === "zh-CN");
    expect(en?.coverUrl).toBe("/uploads/en-cover.webp");
    expect(zh?.coverUrl).toBeNull(); // 中文封面永远在主表,翻译行保持 NULL
  });

  it("缺省(undefined)=快照回填保留既有 —— 该语言行在、coverUrl 键不在时不丢英文封面", async () => {
    const c = await makeContent("keep", { coverUrl: "/uploads/zh-main.webp", enCover: "/uploads/en-keep.webp" });
    // 两个语言都传,但 en 的 coverUrl 键缺省(undefined)→ 靠快照回填保留
    await content.saveContent({
      id: c.id,
      slug: c.slug,
      categoryId,
      status: "PUBLISHED",
      authorName: "封面测试",
      publishAt: null,
      coverUrl: "/uploads/zh-main.webp",
      translations: [
        { locale: "zh-CN", title: "中文标题改", body: "<p>x</p>" },
        { locale: "en", title: "EN title new", body: "<p>x</p>" } as never,
      ],
    });
    const en = await db.contentTranslation.findFirst({ where: { contentId: c.id, locale: "en" } });
    expect(en?.coverUrl).toBe("/uploads/en-keep.webp");
  });

  it("MCP 真实往返形态:未传语言的翻译行以 {...prev} 全字段回传 → 英文封面原样保留", async () => {
    const c = await makeContent("mcp", { coverUrl: "/uploads/zh-main.webp", enCover: "/uploads/en-mcp.webp" });
    // MCP push_article 实际路径:GET 拿全字段翻译行,更新语言重组装、未传语言 {...prev} 回传
    const edit = await content.getContentForEdit(c.id);
    const prevEn = edit!.translations.find((t) => t.locale === "en");
    expect(prevEn?.coverUrl).toBe("/uploads/en-mcp.webp");
    await content.saveContent({
      id: c.id,
      slug: c.slug,
      categoryId,
      status: "PUBLISHED",
      authorName: "封面测试",
      publishAt: null,
      coverUrl: "/uploads/zh-main.webp",
      translations: [
        { locale: "zh-CN", title: "中文标题改", body: "<p>x</p>" },
        { ...prevEn, title: "EN title mcp" } as never, // 带多余键(id/contentId 等),zod 剥除后照常写入
      ],
    });
    const en = await db.contentTranslation.findFirst({ where: { contentId: c.id, locale: "en" } });
    expect(en?.coverUrl).toBe("/uploads/en-mcp.webp");
  });

  it("边界:en 翻译行整行缺省(如标题清空)→ 行删除,英文封面随之失效回退主封面(文档化语义)", async () => {
    const c = await makeContent("boundary", { coverUrl: "/uploads/zh-main.webp", enCover: "/uploads/en-gone.webp" });
    await content.saveContent({
      id: c.id,
      slug: c.slug,
      categoryId,
      status: "PUBLISHED",
      authorName: "封面测试",
      publishAt: null,
      coverUrl: "/uploads/zh-main.webp",
      translations: [{ locale: "zh-CN", title: "中文标题", body: "<p>x</p>" }],
    });
    const en = await db.contentTranslation.findFirst({ where: { contentId: c.id, locale: "en" } });
    expect(en).toBeNull();
    const detail = await content.getPublishedBySlug(c.slug, "en");
    expect(detail?.coverUrl).toBe("/uploads/zh-main.webp");
  });

  it("null=清空(回退主封面);空串同样归 NULL", async () => {
    const c = await makeContent("clear", { coverUrl: "/uploads/zh-main.webp", enCover: "/uploads/en-old.webp" });
    await content.saveContent({
      id: c.id,
      slug: c.slug,
      categoryId,
      status: "PUBLISHED",
      authorName: "封面测试",
      publishAt: null,
      coverUrl: "/uploads/zh-main.webp",
      translations: [
        { locale: "zh-CN", title: "中文标题", body: "<p>x</p>" },
        { locale: "en", title: "EN", body: "<p>x</p>", coverUrl: null },
      ],
    });
    const en = await db.contentTranslation.findFirst({ where: { contentId: c.id, locale: "en" } });
    expect(en?.coverUrl).toBeNull();

    const c2 = await makeContent("clear-empty", { enCover: "/uploads/en-old.webp" });
    await content.saveContent({
      id: c2.id,
      slug: c2.slug,
      categoryId,
      status: "PUBLISHED",
      authorName: "封面测试",
      publishAt: null,
      coverUrl: null,
      translations: [
        { locale: "zh-CN", title: "中文标题", body: "<p>x</p>" },
        { locale: "en", title: "EN", body: "<p>x</p>", coverUrl: "  " },
      ],
    });
    const en2 = await db.contentTranslation.findFirst({ where: { contentId: c2.id, locale: "en" } });
    expect(en2?.coverUrl).toBeNull();
  });
});

describe("读路径回退链(V4.8.4):该语言翻译封面 → 主表封面", () => {
  it("详情:en 有专属封面→英文页用它;zh 页永远用主封面", async () => {
    const c = await makeContent("detail-a", { coverUrl: "/uploads/zh-main.webp", enCover: "/uploads/en-cover.webp" });
    const en = await content.getPublishedBySlug(c.slug, "en");
    const zh = await content.getPublishedBySlug(c.slug, "zh-CN");
    expect(en?.coverUrl).toBe("/uploads/en-cover.webp");
    expect(zh?.coverUrl).toBe("/uploads/zh-main.webp");
  });

  it("详情:en 无专属封面(存量内容)→ 英文页回退主封面;en 翻译行整行缺失同样回退", async () => {
    const c = await makeContent("detail-b", { coverUrl: "/uploads/zh-main.webp", enCover: null });
    const en = await content.getPublishedBySlug(c.slug, "en");
    expect(en?.coverUrl).toBe("/uploads/zh-main.webp");

    const c2 = await makeContent("detail-c", { coverUrl: "/uploads/zh-main.webp", enTitle: null });
    const en2 = await content.getPublishedBySlug(c2.slug, "en");
    expect(en2?.coverUrl).toBe("/uploads/zh-main.webp");
  });

  it("列表卡片:卡片封面按当前语言解析(栏目列表入口)", async () => {
    const c = await makeContent("card", { coverUrl: "/uploads/zh-main.webp", enCover: "/uploads/en-card.webp" });
    const en = await content.listPublishedByCategory("v484-cover-cat", "en", 1, 12);
    const zh = await content.listPublishedByCategory("v484-cover-cat", "zh-CN", 1, 12);
    expect(en?.items.find((i) => i.id === c.id)?.coverUrl).toBe("/uploads/en-card.webp");
    expect(zh?.items.find((i) => i.id === c.id)?.coverUrl).toBe("/uploads/zh-main.webp");
  });

  it("搜索:命中卡片的封面按当前语言解析", async () => {
    const c = await makeContent("search", { coverUrl: "/uploads/zh-main.webp", enCover: "/uploads/en-search.webp" });
    const en = await content.searchPublished("en", "Cover test");
    expect(en.items.find((i) => i.id === c.id)?.coverUrl).toBe("/uploads/en-search.webp");
  });

  it("商品详情:en 专属封面优先,回退主封面", async () => {
    const p = await makeContent("prod", {
      coverUrl: "/uploads/zh-prod.webp",
      enCover: "/uploads/en-prod.webp",
      categoryId: productId,
    });
    const en = await product.getProductDetail(p.slug, "en");
    expect(en?.coverUrl).toBe("/uploads/en-prod.webp");
  });

  it("个人收藏列表:封面按当前语言解析", async () => {
    const c = await makeContent("fav", { coverUrl: "/uploads/zh-main.webp", enCover: "/uploads/en-fav.webp" });
    await db.favorite.create({
      data: { userId, targetType: "CONTENT", targetId: c.id },
    });
    const en = await ugc.listMyFavorites(userId, "en");
    expect(en.find((i) => i.contentId === c.id)?.coverUrl).toBe("/uploads/en-fav.webp");
  });
});

describe("API 层贯通(V4.8.4):zod 不剥除、GET 回显", () => {
  let PUT: typeof import("@/app/api/admin/contents/route")["PUT"];
  let GET: typeof import("@/app/api/admin/contents/route")["GET"];

  it("PUT 带 translations[].coverUrl → 保存生效(zod 静默剥除回归锁)", async () => {
    ({ PUT, GET } = await import("@/app/api/admin/contents/route"));
    const res = await PUT(
      new Request("http://localhost/api/admin/contents", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: slugOf(`api-${++seq}`),
          categoryId,
          status: "PUBLISHED",
          authorName: "封面测试",
          coverUrl: "/uploads/zh-main.webp",
          publishAt: null,
          translations: [
            { locale: "zh-CN", title: "中文标题", body: "<p>x</p>" },
            { locale: "en", title: "EN", body: "<p>x</p>", coverUrl: "/uploads/en-api.webp" },
          ],
        }),
      })
    );
    const json = (await res.json()) as { ok: boolean; data?: { id: number } };
    expect(json.ok, "PUT 应成功").toBe(true);
    const en = await db.contentTranslation.findFirst({
      where: { contentId: json.data!.id, locale: "en" },
    });
    expect(en?.coverUrl).toBe("/uploads/en-api.webp");
  });

  it("GET ?id= 回显翻译行 coverUrl(编辑器与 MCP {...prev} 往返的数据源)", async () => {
    const c = await makeContent("edit-echo", { enCover: "/uploads/en-echo.webp" });
    const res = await GET(new Request(`http://localhost/api/admin/contents?id=${c.id}`));
    const json = (await res.json()) as {
      ok: boolean;
      data?: { translations: { locale: string; coverUrl: string | null }[] };
    };
    expect(json.ok).toBe(true);
    const en = json.data!.translations.find((t) => t.locale === "en");
    expect(en?.coverUrl).toBe("/uploads/en-echo.webp");
  });
});
