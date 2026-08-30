import { beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

/**
 * TEST-013(AC-011 / NFR-001):前台用户响应隐私边界。
 * 先给用户写入 companyName/country/province/city(及 avatarUrl),
 * 再对**所有前台出口**(toPublicUser 序列化、/api/auth/me、登录、注册)断言:
 * 响应对象绝不含 companyName/country/province/city 键,且为统一白名单形状
 * { id, email, nickname, avatarUrl }。
 *
 * RED 约定:能力缺失以 missing_behavior 断言失败暴露。
 * next/headers cookies() 以 vi.mock 注入,使 me 路由可在 node 测试环境携带会话调用。
 */

const cookieStore = vi.hoisted(() => ({ current: {} as Record<string, string> }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieStore.current[name] ? { name, value: cookieStore.current[name] } : undefined,
  }),
}));

type UserModule = typeof import("@/server/user");
type MeRouteModule = typeof import("@/app/api/auth/me/route");
type LoginRouteModule = typeof import("@/app/api/auth/login/route");
type RegisterRouteModule = typeof import("@/app/api/auth/register/route");

let db: PrismaClient;
let userModule: UserModule;
let meRoute: MeRouteModule;
let loginRoute: LoginRouteModule;
let registerRoute: RegisterRouteModule;
let secretUserId: number;
let userToken: string;

const PRIVACY_KEYS = ["companyName", "country", "province", "city"] as const;

function expectFn(mod: unknown, name: string, where: string): void {
  expect(
    typeof (mod as Record<string, unknown>)?.[name],
    `missing_behavior:${name} 尚未实现(${where})`
  ).toBe("function");
}

function assertNoPrivacyKeys(obj: unknown, label: string): void {
  const keys = Object.keys((obj as Record<string, unknown>) ?? {});
  for (const k of PRIVACY_KEYS) {
    expect(
      keys,
      `${label} 泄露隐私字段:${k}(NFR-001 前台响应不得包含 ${PRIVACY_KEYS.join("/")})`
    ).not.toContain(k);
  }
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
  const { USER_COOKIE } = await import("@/lib/auth/session");

  userModule = (await import("@/server/user")) as UserModule;
  meRoute = (await import("@/app/api/auth/me/route")) as MeRouteModule;
  loginRoute = (await import("@/app/api/auth/login/route")) as LoginRouteModule;
  registerRoute = (await import("@/app/api/auth/register/route")) as RegisterRouteModule;

  const user = await userModule.registerByEmail({
    email: "secret@example.com",
    password: "password-123",
    nickname: "隐私用户",
  });
  // 直接写库模拟「后台已完成资料维护」的用户
  await db.user.update({
    where: { id: user.id },
    data: {
      companyName: "绝密公司",
      country: "某个国家",
      province: "某个省",
      city: "某个市",
      avatarUrl: "https://cdn.example.com/avatar.png",
    },
  });
  secretUserId = user.id;
  userToken = await signToken(
    { sub: String(secretUserId), typ: "user", name: "隐私用户" },
    "1h"
  );
  void USER_COOKIE;
});

describe("TEST-013: toPublicUser 前台序列化白名单(NFR-001)", () => {
  it("只返回 id/email/nickname/avatarUrl,绝不含 4 个资料字段", async () => {
    expectFn(userModule, "toPublicUser", "@/server/user");

    const row = await db.user.findUnique({ where: { id: secretUserId } });
    expect(row).toBeTruthy();
    const pub = userModule.toPublicUser(row!);
    assertNoPrivacyKeys(pub, "toPublicUser");
    expect(pub).toEqual({
      id: secretUserId,
      email: "secret@example.com",
      nickname: "隐私用户",
      avatarUrl: "https://cdn.example.com/avatar.png",
    });
  });

  it("getActiveUserInfo 经白名单序列化(全量 DB 行进、白名单出)", async () => {
    expectFn(userModule, "getActiveUserInfo", "@/server/user");
    const pub = await userModule.getActiveUserInfo(secretUserId);
    assertNoPrivacyKeys(pub, "getActiveUserInfo");
    expect(pub).toEqual({
      id: secretUserId,
      email: "secret@example.com",
      nickname: "隐私用户",
      avatarUrl: "https://cdn.example.com/avatar.png",
    });
  });
});

describe("TEST-013: /api/auth/me 出口(AC-011)", () => {
  it("携带会话调用 me → 响应 data 不含 4 个隐私键且为白名单形状", async () => {
    expectFn(meRoute, "GET", "/api/auth/me");
    cookieStore.current = { aition_user: userToken };

    const res = await meRoute.GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: Record<string, unknown> | null };
    expect(body.ok).toBe(true);
    expect(body.data).toBeTruthy();
    assertNoPrivacyKeys(body.data, "/api/auth/me");
    expect(body.data, "missing_behavior:me 响应应统一为 toPublicUser 白名单形状").toEqual({
      id: secretUserId,
      email: "secret@example.com",
      nickname: "隐私用户",
      avatarUrl: "https://cdn.example.com/avatar.png",
    });
  });
});

describe("TEST-013: 登录/注册出口(AC-011)", () => {
  it("POST /api/auth/login → 响应 data 不含 4 个隐私键且为白名单形状", async () => {
    expectFn(loginRoute, "POST", "/api/auth/login");
    const res = await loginRoute.POST(
      jsonRequest("http://localhost/api/auth/login", {
        email: "secret@example.com",
        password: "password-123",
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: Record<string, unknown> };
    expect(body.ok).toBe(true);
    assertNoPrivacyKeys(body.data, "登录响应");
    expect(body.data, "missing_behavior:登录响应应统一为 toPublicUser 白名单形状").toEqual({
      id: secretUserId,
      email: "secret@example.com",
      nickname: "隐私用户",
      avatarUrl: "https://cdn.example.com/avatar.png",
    });
  });

  it("POST /api/auth/register → 响应 data 不含 4 个隐私键(键不存在,而非 null)", async () => {
    expectFn(registerRoute, "POST", "/api/auth/register");
    const res = await registerRoute.POST(
      jsonRequest("http://localhost/api/auth/register", {
        email: "fresh-privacy@example.com",
        password: "password-123",
        nickname: "新注册",
        agree: true,
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: Record<string, unknown> };
    expect(body.ok).toBe(true);
    assertNoPrivacyKeys(body.data, "注册响应");
    expect(Object.keys(body.data).sort(), "注册响应应为白名单键集").toEqual(
      ["avatarUrl", "email", "id", "nickname"].sort()
    );
  });
});
