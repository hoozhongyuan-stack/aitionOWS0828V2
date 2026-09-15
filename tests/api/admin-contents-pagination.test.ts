import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * 分页参数透传回归锁(V4.7.2)。
 *
 * 背景:内容列表页请求带了 `pageSize`,但 `GET /api/admin/contents` 漏读该参数 →
 * 服务层回落默认值(当时 20),页面「每页 10 条」实际拉 20 条、两套分页器算出不同页数。
 * 这类"UI 发了、接口不认"的静默失效在本项目已出现三次(媒体 folderId/keyword、
 * 内容 price/spu 字段、本次 pageSize),所以这里从**接口层**锁住参数贯通。
 *
 * 管理员守卫打桩(本文件只验证分页参数,不测登录)。
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
let GET: typeof import("@/app/api/admin/contents/route")["GET"];

const TOTAL = 25;

/** 调列表接口并返回 payload(data 包裹) */
async function list(qs: string) {
  const res = await GET(new Request(`http://localhost/api/admin/contents?${qs}`));
  const json = (await res.json()) as {
    ok: boolean;
    data?: { total: number; page: number; pageSize: number; items: unknown[] };
  };
  expect(json.ok, `接口应成功:${qs}`).toBe(true);
  if (!json.data) throw new Error("缺少 data");
  return json.data;
}

beforeAll(async () => {
  ({ prisma } = await import("@/lib/db"));
  ({ GET } = await import("@/app/api/admin/contents/route"));

  const cat = await prisma.category.create({
    data: {
      slug: "v472-page-cat",
      moduleType: "article",
      visible: true,
      translations: { create: { locale: "zh-CN", name: "分页回归栏目" } },
    },
  });
  for (let i = 0; i < TOTAL; i++) {
    await prisma.content.create({
      data: {
        slug: `v472-page-${i}`,
        categoryId: cat.id,
        status: i < 20 ? "PUBLISHED" : "DRAFT",
        authorName: "分页测试",
        translations: {
          create: { locale: "zh-CN", title: `分页测试 ${i}`, summary: `第 ${i} 条`, body: "<p>x</p>" },
        },
      },
    });
  }
});

describe("GET /api/admin/contents 分页参数透传(V4.7.2)", () => {
  it("请求 pageSize=10 → 接口声明的 pageSize 就是 10,且实际返回 10 条", async () => {
    const d = await list("page=1&pageSize=10&keyword=分页测试");
    expect(d.pageSize).toBe(10); // 核心断言:接口不得偷换成默认值
    expect(d.items).toHaveLength(10);
  });

  it("请求 pageSize=50 → 声明 50 并按 50 取", async () => {
    const d = await list("page=1&pageSize=50&keyword=分页测试");
    expect(d.pageSize).toBe(50);
    expect(d.items).toHaveLength(TOTAL);
  });

  it("不传 pageSize → 默认 10(与后台界面「每页」默认一致)", async () => {
    const d = await list("page=1&keyword=分页测试");
    expect(d.pageSize).toBe(10);
    expect(d.items).toHaveLength(10);
  });

  it("末页取到剩余条数,总页数与声明值自洽(total/pageSize)", async () => {
    const d = await list("page=3&pageSize=10&keyword=分页测试");
    expect(d.page).toBe(3);
    expect(d.items).toHaveLength(TOTAL - 20);
    expect(Math.ceil(d.total / d.pageSize)).toBe(3);
  });

  it("非法/越界 pageSize 被钳制到 1..100(不返回空页)", async () => {
    expect((await list("page=1&pageSize=0&keyword=分页测试")).pageSize).toBe(10); // 0 → NaN? 走默认
    expect((await list("page=1&pageSize=999&keyword=分页测试")).pageSize).toBe(100);
  });

  it("其余筛选参数继续生效(status 过滤)", async () => {
    const d = await list("page=1&pageSize=50&keyword=分页测试&status=DRAFT");
    expect(d.total).toBe(TOTAL - 20);
    expect(d.items).toHaveLength(TOTAL - 20);
  });
});
