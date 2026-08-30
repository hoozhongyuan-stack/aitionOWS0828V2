import { beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

/**
 * TEST-012(AC-010 / REQ-009):后台用户资料维护。
 * - adminUpdateProfile:公司名称/国家/省/市 4 字段全可选、trim、≤100、可留空保存;
 * - listUsersAdmin:q 参数按公司名称 contains 模糊搜索;
 * - /api/admin/users 路由:PATCH 资料更新(管理员鉴权)+ GET q 透传与 4 字段回显。
 *
 * RED 约定:能力缺失以 missing_behavior 断言失败暴露,而非模块解析/基建错误。
 * next/headers cookies() 以 vi.mock 注入,使管理员会话可在 node 测试环境构造。
 */

const cookieStore = vi.hoisted(() => ({ current: {} as Record<string, string> }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieStore.current[name] ? { name, value: cookieStore.current[name] } : undefined,
  }),
}));

type UserModule = typeof import("@/server/user");
type AdminUsersRouteModule = typeof import("@/app/api/admin/users/route");

let db: PrismaClient;
let adminToken: string;
let targetUserId: number;
let acmeUserId: number;

async function loadUserModule(): Promise<UserModule> {
  return (await import("@/server/user")) as UserModule;
}

async function loadAdminUsersRoute(): Promise<AdminUsersRouteModule> {
  return (await import("@/app/api/admin/users/route")) as AdminUsersRouteModule;
}

function expectFn(mod: unknown, name: string, where: string): void {
  expect(
    typeof (mod as Record<string, unknown>)?.[name],
    `missing_behavior:${name} 尚未实现(${where})`
  ).toBe("function");
}

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  db = (await import("@/lib/db")).prisma;
  const { signToken } = await import("@/lib/auth/jwt");
  const { ADMIN_COOKIE } = await import("@/lib/auth/session");

  adminToken = await signToken({ sub: "1", typ: "admin", name: "管理员" }, "1h");

  const target = await db.user.create({
    data: { email: "profile-target@example.com", nickname: "资料用户", status: "ACTIVE" },
  });
  targetUserId = target.id;

  const acme = await db.user.create({
    data: { email: "acme@example.com", nickname: "AcmeUser", status: "ACTIVE" },
  });
  acmeUserId = acme.id;

  await db.user.create({
    data: { email: "other@example.com", nickname: "OtherUser", status: "ACTIVE" },
  });
});

describe("TEST-012: adminUpdateProfile 服务(AC-010)", () => {
  it("保存公司名称/国家/省/市 4 字段后回读一致", async () => {
    const { adminUpdateProfile } = await loadUserModule();
    expectFn({ adminUpdateProfile }, "adminUpdateProfile", "@/server/user");

    await adminUpdateProfile(targetUserId, {
      companyName: "示例科技有限公司",
      country: "中国",
      province: "广东",
      city: "深圳",
    });
    const row = await db.user.findUnique({ where: { id: targetUserId } });
    expect(row?.companyName).toBe("示例科技有限公司");
    expect(row?.country).toBe("中国");
    expect(row?.province).toBe("广东");
    expect(row?.city).toBe("深圳");
  });

  it("全部留空保存成功(空串视为清空,字段可为 null)", async () => {
    const { adminUpdateProfile } = await loadUserModule();
    expectFn({ adminUpdateProfile }, "adminUpdateProfile", "@/server/user");

    // 全空对象:不传任何字段也应成功(REQ-009 全部非必填)
    await expect(adminUpdateProfile(targetUserId, {})).resolves.toBeTruthy();

    // 显式空串:视为清空
    await adminUpdateProfile(targetUserId, { companyName: "", country: "", province: "", city: "" });
    const row = await db.user.findUnique({ where: { id: targetUserId } });
    expect(row?.companyName).toBeNull();
    expect(row?.country).toBeNull();
    expect(row?.province).toBeNull();
    expect(row?.city).toBeNull();
  });

  it("任一字段超过 100 字符 → 拒绝保存", async () => {
    const { adminUpdateProfile } = await loadUserModule();
    expectFn({ adminUpdateProfile }, "adminUpdateProfile", "@/server/user");

    const before = await db.user.findUnique({ where: { id: targetUserId } });
    await expect(
      adminUpdateProfile(targetUserId, { companyName: "长".repeat(101) })
    ).rejects.toBeInstanceOf(Error);
    const after = await db.user.findUnique({ where: { id: targetUserId } });
    expect(after?.companyName).toBe(before?.companyName);
  });

  it("部分字段更新:未传字段保持原值不被改动,传值字段正常写入", async () => {
    const { adminUpdateProfile } = await loadUserModule();
    // 先写入基线
    await adminUpdateProfile(targetUserId, { country: "中国", city: "深圳" });
    // 仅更新 city:country 未传 → 保持原值(REQ-009 局部更新语义)
    await adminUpdateProfile(targetUserId, { city: "杭州" });
    const row = await db.user.findUnique({ where: { id: targetUserId } });
    expect(row?.city).toBe("杭州");
    expect(row?.country).toBe("中国");
    expect(row?.companyName).toBeNull();
  });
});

describe("NFR-001: toPublicUser 前台白名单序列化(新模块 @/server/user/profile 直测)", () => {
  it("仅输出 id/email/nickname/avatarUrl;昵称缺省回退邮箱前缀,再回退「用户{id}」", async () => {
    const mod = await loadUserModule();
    expectFn(mod, "toPublicUser", "@/server/user");

    // 昵称为空 → 邮箱前缀
    const byEmail = mod.toPublicUser!({ id: 7, email: "alice@b.com", nickname: null, avatarUrl: "/a.png" });
    expect(byEmail).toEqual({ id: 7, email: "alice@b.com", nickname: "alice", avatarUrl: "/a.png" });

    // 邮箱也为空 → 「用户{id}」兜底
    const fallback = mod.toPublicUser!({ id: 8, email: null, nickname: null, avatarUrl: null });
    expect(fallback).toEqual({ id: 8, email: null, nickname: "用户8", avatarUrl: null });

    // 白名单:任何输入都不产生 4 个资料字段键(NFR-001)
    for (const out of [byEmail, fallback]) {
      expect(Object.keys(out).sort()).toEqual(["avatarUrl", "email", "id", "nickname"]);
      expect(out).not.toHaveProperty("companyName");
      expect(out).not.toHaveProperty("country");
      expect(out).not.toHaveProperty("province");
      expect(out).not.toHaveProperty("city");
    }
  });
});

describe("TEST-012: listUsersAdmin 按公司名称模糊搜索(AC-010)", () => {
  beforeAll(async () => {
    const { adminUpdateProfile } = await loadUserModule();
    if (typeof adminUpdateProfile !== "function") return; // RED:夹具依赖缺失时跳过
    await adminUpdateProfile(acmeUserId, { companyName: "Acme 有限公司" });
  });

  it("q=公司名关键字 → 仅返回匹配用户;q=不匹配关键字 → 空结果", async () => {
    const { listUsersAdmin } = await loadUserModule();
    expectFn({ listUsersAdmin }, "listUsersAdmin", "@/server/user");

    const hit = await listUsersAdmin({ q: "Acme" });
    expect(
      hit.items.map((u) => u.id),
      "missing_behavior:q 参数应按公司名称模糊搜索(当前疑似被忽略)"
    ).toEqual([acmeUserId]);

    const miss = await listUsersAdmin({ q: "不存在的小宇宙公司" });
    expect(miss.items).toHaveLength(0);
    expect(miss.total).toBe(0);
  });
});

describe("TEST-012: /api/admin/users 路由(资料更新 + q 透传)", () => {
  it("PATCH:未带管理员会话 → 401", async () => {
    const route = await loadAdminUsersRoute();
    expectFn(route, "PATCH", "/api/admin/users");

    cookieStore.current = {};
    const res = await route.PATCH(
      jsonRequest("http://localhost/api/admin/users", {
        id: targetUserId,
        companyName: "未授权公司",
      })
    );
    expect(res.status, "missing_behavior:非管理员更新资料应返回 401").toBe(401);
    const row = await db.user.findUnique({ where: { id: targetUserId } });
    expect(row?.companyName).not.toBe("未授权公司");
  });

  it("PATCH:管理员更新资料 → 200 且响应回显 4 字段、库内一致", async () => {
    const route = await loadAdminUsersRoute();
    expectFn(route, "PATCH", "/api/admin/users");

    cookieStore.current = { aition_admin: adminToken };
    const res = await route.PATCH(
      jsonRequest("http://localhost/api/admin/users", {
        id: targetUserId,
        companyName: "回显公司",
        country: "日本",
        province: "东京都",
        city: "千代田",
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: Record<string, string | number | null>;
    };
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({
      companyName: "回显公司",
      country: "日本",
      province: "东京都",
      city: "千代田",
    });
    const row = await db.user.findUnique({ where: { id: targetUserId } });
    expect(row?.companyName).toBe("回显公司");
    expect(row?.city).toBe("千代田");
  });

  it("GET:q 透传公司名搜索,列表项含 4 个资料字段(供后台编辑回显)", async () => {
    const route = await loadAdminUsersRoute();
    cookieStore.current = { aition_admin: adminToken };

    const res = await route.GET(
      new Request("http://localhost/api/admin/users?q=" + encodeURIComponent("Acme"))
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: { total: number; items: Record<string, unknown>[] };
    };
    expect(body.ok).toBe(true);
    expect(
      body.data.items.map((u) => u.id),
      "missing_behavior:GET 应透传 q 参数按公司名称过滤"
    ).toEqual([acmeUserId]);
    expect(
      body.data.items[0],
      "missing_behavior:后台列表项应包含 companyName/country/province/city 供编辑回显"
    ).toMatchObject({ companyName: "Acme 有限公司" });
  });
});
