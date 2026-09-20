import { describe, expect, it } from "vitest";
import { resolveAdminLanding, canSeeMenu, type PermissionKey } from "@/server/admin/permissions";

/**
 * 子账号登录落地页(V4.8.1 修复)。
 *
 * 回归背景:登录成功曾写死跳 /admin/dashboard,而该页仅主账号可见 ——
 * 子账号一登录就吃 403「无权限执行此操作」并弹红条。这里锁住"按权限选落地页"。
 */

const P = (...keys: PermissionKey[]) => keys;

describe("resolveAdminLanding", () => {
  it("主账号 → 数据看板(主账号专属页)", () => {
    expect(resolveAdminLanding("OWNER", P())).toBe("/admin/dashboard");
  });

  it("内容权限 → 内容列表", () => {
    expect(resolveAdminLanding("STAFF", P("content"))).toBe("/admin/content");
  });

  it("只有交易权限 → 订单管理", () => {
    expect(resolveAdminLanding("STAFF", P("commerce"))).toBe("/admin/orders");
  });

  it("只有审核权限 → 互动审核", () => {
    expect(resolveAdminLanding("STAFF", P("moderation"))).toBe("/admin/ugc");
  });

  it("只有 GEO 权限 → GEO 监测", () => {
    expect(resolveAdminLanding("STAFF", P("geo"))).toBe("/admin/geo-monitor");
  });

  it("多权限按固定顺序取第一个(内容优先于 GEO)", () => {
    expect(resolveAdminLanding("STAFF", P("geo", "content"))).toBe("/admin/content");
  });

  it("一个权限都没勾 → null(由入口页渲染待分配权限空态)", () => {
    expect(resolveAdminLanding("STAFF", P())).toBeNull();
  });

  it("落地页一定是该角色真的能看见的菜单(交叉校验)", () => {
    const cases: PermissionKey[][] = [[], ["content"], ["commerce"], ["moderation"], ["geo"]];
    for (const perms of cases) {
      const landing = resolveAdminLanding("STAFF", perms);
      if (landing === null) continue;
      expect(canSeeMenu(landing, "STAFF", perms), `${landing} 应可见于 ${perms.join(",")}`).toBe(true);
      // 且绝不能落到主账号专属页,否则又是红条
      expect(landing).not.toBe("/admin/dashboard");
    }
  });

  it("子账号永远拿不到主账号专属的看板/配置类菜单", () => {
    const ownerOnly = [
      "/admin/dashboard",
      "/admin/theme",
      "/admin/settings",
      "/admin/admin-users",
      "/admin/backup",
    ];
    for (const menu of ownerOnly) {
      expect(canSeeMenu(menu, "STAFF", P("content", "commerce", "moderation", "geo"))).toBe(false);
    }
  });
});
