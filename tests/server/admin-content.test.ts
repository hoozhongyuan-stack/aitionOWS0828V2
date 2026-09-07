import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * TEST-001 扩展(对应 AC-001 / REQ-001 / TASK-006):后台商品编辑保存链路。
 * - API PUT /api/admin/contents 接受 gallery(字符串数组)/specs([{k,v}])并持久化
 * - zod 校验:gallery 项为非空字符串且 ≤20 张;specs 键值非空且 ≤50 行
 * - 服务层兜底:超限抛错;未传字段不改动既有值(编辑页 article 内容不受影响)
 *
 * 管理员守卫打桩(本文件只验证保存链路,不测登录)。
 */

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...actual,
    requireAdmin: async () => ({ admin: { id: 1, name: "tester" } }),
    requireOwner: async () => ({ admin: { id: 1, name: "tester", role: "OWNER", permissions: [] } }),
    requirePerm: async () => ({ admin: { id: 1, name: "tester", role: "OWNER", permissions: [] } }),
  };
});

let prisma: typeof import("@/lib/db")["prisma"];
let PUT: typeof import("@/app/api/admin/contents/route")["PUT"];
let saveContent: typeof import("@/server/content")["saveContent"];
let categoryId: number;

/** 构造管理端 PUT 请求(JSON body) */
function putReq(body: unknown): Request {
  return new Request("http://localhost/api/admin/contents", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    slug: "admin-product",
    categoryId,
    status: "PUBLISHED",
    authorName: "管理员",
    coverUrl: null,
    publishAt: null,
    translations: [{ locale: "zh-CN", title: "后台商品", body: "<p>x</p>" }],
    ...overrides,
  };
}

beforeAll(async () => {
  ({ prisma } = await import("@/lib/db"));
  ({ PUT } = await import("@/app/api/admin/contents/route"));
  ({ saveContent } = await import("@/server/content"));

  const cat = await prisma.category.create({
    data: {
      slug: "admin-cat",
      moduleType: "product",
      translations: { create: { locale: "zh-CN", name: "后台栏目" } },
    },
  });
  categoryId = cat.id;
});

describe("TASK-006:后台保存链路(API PUT)接受并持久化 gallery/specs", () => {
  it("PUT 携带 gallery/specs 保存成功,库内 JSON 与提交内容一致", async () => {
    const res = await PUT(
      putReq(
        validBody({
          gallery: ["/uploads/g1.webp", "/uploads/g2.webp"],
          specs: [
            { k: "型号", v: "AX-100" },
            { k: "材质", v: "铝合金" },
          ],
        })
      )
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);

    const row = await prisma.content.findUnique({ where: { slug: "admin-product" } });
    expect(row).toBeTruthy();
    expect(JSON.parse(row!.gallery!)).toEqual(["/uploads/g1.webp", "/uploads/g2.webp"]);
    expect(JSON.parse(row!.specs!)).toEqual([
      { k: "型号", v: "AX-100" },
      { k: "材质", v: "铝合金" },
    ]);
  });

  it("gallery 超过 20 张 → 请求被拒绝(400),内容不落库", async () => {
    const res = await PUT(
      putReq(validBody({ slug: "admin-product-overflow", gallery: Array.from({ length: 21 }, (_, i) => `/uploads/${i}.webp`) }))
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(false);
    expect(await prisma.content.count({ where: { slug: "admin-product-overflow" } })).toBe(0);
  });

  it("specs 键为空 → 请求被拒绝(400)", async () => {
    const res = await PUT(
      putReq(
        validBody({ slug: "admin-product-badspec", specs: [{ k: "", v: "1kg" }] })
      )
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(false);
    expect(await prisma.content.count({ where: { slug: "admin-product-badspec" } })).toBe(0);
  });
});

describe("服务层兜底(saveContent)", () => {
  it("gallery >20 / specs >50 抛错拒绝保存", async () => {
    await expect(
      saveContent({
        ...validBody({ slug: "svc-overflow" }),
        gallery: Array.from({ length: 21 }, (_, i) => `/uploads/${i}.webp`),
      } as Parameters<typeof saveContent>[0])
    ).rejects.toThrow(/20/);
    await expect(
      saveContent({
        ...validBody({ slug: "svc-overflow-2" }),
        specs: Array.from({ length: 51 }, (_, i) => ({ k: `k${i}`, v: "v" })),
      } as Parameters<typeof saveContent>[0])
    ).rejects.toThrow(/50/);
  });

  it("空数组存 null;未传 gallery/specs 时保留既有值(不影响 article 编辑)", async () => {
    const created = await saveContent({
      ...validBody({ slug: "svc-preserve" }),
      gallery: ["/uploads/keep.webp"],
      specs: [{ k: "型号", v: "AX-1" }],
    } as Parameters<typeof saveContent>[0]);
    // 未传两个字段再次保存(模拟 article 编辑页不提交商品字段;后台更新必带 id)
    await saveContent({
      id: created.id,
      slug: "svc-preserve",
      categoryId,
      status: "PUBLISHED",
      authorName: "管理员",
      coverUrl: null,
      publishAt: null,
      translations: [{ locale: "zh-CN", title: "后台商品", body: "<p>x</p>" }],
    } as Parameters<typeof saveContent>[0]);
    const row = await prisma.content.findUnique({ where: { slug: "svc-preserve" } });
    expect(JSON.parse(row!.gallery!)).toEqual(["/uploads/keep.webp"]);
    expect(JSON.parse(row!.specs!)).toEqual([{ k: "型号", v: "AX-1" }]);

    // 显式传空数组 → 清空(存 null)
    await saveContent({
      id: created.id,
      slug: "svc-preserve",
      categoryId,
      status: "PUBLISHED",
      authorName: "管理员",
      coverUrl: null,
      publishAt: null,
      gallery: [],
      specs: [],
      translations: [{ locale: "zh-CN", title: "后台商品", body: "<p>x</p>" }],
    } as Parameters<typeof saveContent>[0]);
    const cleared = await prisma.content.findUnique({ where: { slug: "svc-preserve" } });
    expect(cleared?.gallery).toBeNull();
    expect(cleared?.specs).toBeNull();
  });
});
