import { describe, expect, it, vi } from "vitest";

/**
 * GEO 服务分支覆盖补齐:非法 preset 回退、脏 JSON 容错、record 异常静默。
 * 用例间无共享状态(独立数据/独立 mock,自行清理)。
 */
describe("GEO 服务分支", () => {
  it("saveHomeLayout:非法 preset 回退 grid", async () => {
    const { saveHomeLayout, getHomeLayout } = await import("@/server/layout");
    const { prisma } = await import("@/lib/db");
    await saveHomeLayout({ preset: "hacker" });
    const cfg = await getHomeLayout();
    expect(cfg.preset).toBe("grid");
    await prisma.setting.deleteMany({ where: { group: "layout" } });
    await prisma.$disconnect();
  });

  it("saveCategoryLayout:非法 preset 回退 list", async () => {
    const { saveCategoryLayout, getCategoryLayout } = await import("@/server/layout");
    const { prisma } = await import("@/lib/db");
    await saveCategoryLayout({ preset: "space" });
    const cfg = await getCategoryLayout();
    expect(cfg.preset).toBe("list");
    await prisma.setting.deleteMany({ where: { group: "layout" } });
    await prisma.$disconnect();
  });

  it("getHomeLayout:Setting 脏 JSON → 默认配置", async () => {
    const { prisma } = await import("@/lib/db");
    await prisma.setting.upsert({
      where: { group_key: { group: "layout", key: "home" } },
      update: { value: "{broken json" },
      create: { group: "layout", key: "home", value: "{broken json" },
    });
    const { invalidateSettingCache } = await import("@/server/setting");
    invalidateSettingCache("layout");
    const { getHomeLayout } = await import("@/server/layout");
    const cfg = await getHomeLayout();
    expect(cfg.preset).toBe("grid");
    expect(cfg.sections).toEqual({ banners: true, latest: true });
    await prisma.setting.deleteMany({ where: { group: "layout" } });
    await prisma.$disconnect();
  });

  it("recordCrawl:DB 异常静默不抛(不阻断渲染)", async () => {
    const geo = await import("@/server/geo");
    const { prisma } = await import("@/lib/db");
    const spy = vi.spyOn(prisma.aICrawlStat, "upsert").mockRejectedValue(new Error("db down"));
    await expect(geo.recordCrawl("GPTBot (OpenAI)", "/x")).resolves.toBeUndefined();
    spy.mockRestore();
    await prisma.$disconnect();
  });
});
