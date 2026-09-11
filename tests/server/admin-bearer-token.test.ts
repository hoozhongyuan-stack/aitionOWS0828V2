import { describe, expect, it, vi } from "vitest";

/**
 * V4.3.0「程序化访问」回归锁:getAdminSession 令牌来源与边界。
 *
 * 锁住四件事:
 *  ① cookie 路径不回归;② 无 cookie 时可从 Authorization: Bearer 读取;
 *  ③ 非法令牌/前台用户令牌**不得**越权为管理员;
 *  ④ cookie 与 Bearer 并存时以 cookie 为准(不静默提权——cookie 失效即视为未登录)。
 *
 * next/headers 在 node 测试环境不可用 → 按项目既有手法(见 favorite-route.test.ts 注释)
 * 以 vi.mock 替换 cookies()/headers()。
 */

const headerState = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  authorization: undefined as string | undefined,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === "aition_admin" && headerState.cookie ? { value: headerState.cookie } : undefined,
  })),
  headers: vi.fn(async () => ({
    get: (name: string) =>
      name.toLowerCase() === "authorization" ? (headerState.authorization ?? null) : null,
  })),
}));

import { getAdminSession } from "@/lib/auth/session";
import { signToken } from "@/lib/auth/jwt";

const adminToken = (id = 1, name = "管理员") => signToken({ sub: String(id), typ: "admin", name }, "1h");

describe("getAdminSession 令牌来源(V4.3.0)", () => {
  it("① cookie 中的有效管理员令牌 → 返回会话(原有路径零回归)", async () => {
    headerState.cookie = await adminToken(1, "管理员");
    headerState.authorization = undefined;
    expect(await getAdminSession()).toEqual({ id: 1, name: "管理员" });
  });

  it("② 无 cookie 时回退 Authorization: Bearer(程序化访问路径)", async () => {
    headerState.cookie = undefined;
    headerState.authorization = `Bearer ${await adminToken(7, "workbuddy-bot")}`;
    expect(await getAdminSession()).toEqual({ id: 7, name: "workbuddy-bot" });
  });

  it("③ 非法 Bearer 令牌 → null", async () => {
    headerState.cookie = undefined;
    headerState.authorization = "Bearer not-a-jwt";
    expect(await getAdminSession()).toBeNull();
  });

  it("③ 前台用户令牌不得经 Bearer 越权为管理员", async () => {
    headerState.cookie = undefined;
    headerState.authorization = `Bearer ${await signToken({ sub: "3", typ: "user", name: "普通用户" }, "1h")}`;
    expect(await getAdminSession()).toBeNull();
  });

  it("③ 空 Bearer 值 / 无 Authorization 头 → null", async () => {
    headerState.cookie = undefined;
    headerState.authorization = "Bearer ";
    expect(await getAdminSession()).toBeNull();
    headerState.authorization = undefined;
    expect(await getAdminSession()).toBeNull();
  });

  it("④ cookie 与 Bearer 并存且 cookie 失效时 → null(cookie 优先,不静默提权)", async () => {
    headerState.cookie = "invalid-cookie-token";
    headerState.authorization = `Bearer ${await adminToken(1, "管理员")}`;
    expect(await getAdminSession()).toBeNull();
  });
});
