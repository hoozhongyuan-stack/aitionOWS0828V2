import { describe, expect, it } from "vitest";

/**
 * V3.3 首页楼层(getHomeFloors)与国内引擎白名单增补(C3)。
 * 楼层配置存 Setting(group=layout, key="floors");后台通用 API 直接落 JSON 数组,
 * 读取侧兼容裸数组与 {floors:[...]} 包装;逐条容错,非法条目跳过不整组丢弃。
 */

async function writeFloors(value: unknown) {
  const { prisma } = await import("@/lib/db");
  await prisma.setting.upsert({
    where: { group_key: { group: "layout", key: "floors" } },
    update: { value: JSON.stringify(value) },
    create: { group: "layout", key: "floors", value: JSON.stringify(value) },
  });
  const { invalidateSettingCache } = await import("@/server/setting");
  invalidateSettingCache("layout");
}

async function cleanup() {
  const { prisma } = await import("@/lib/db");
  await prisma.setting.deleteMany({ where: { group: "layout", key: "floors" } });
  const { invalidateSettingCache } = await import("@/server/setting");
  invalidateSettingCache("layout");
  await prisma.$disconnect();
}

describe("首页楼层 getHomeFloors", () => {
  it("无配置 → 空数组(现状布局零变化)", async () => {
    const { getHomeFloors } = await import("@/server/layout");
    expect(await getHomeFloors()).toEqual([]);
    await cleanup();
  });

  it("裸数组形状(通用 API 落库口径)正常读取", async () => {
    await writeFloors([
      { categoryId: 3, style: "list", limit: 4 },
      { categoryId: 5, style: "feature", limit: 7, title: "产品精选" },
    ]);
    const { getHomeFloors } = await import("@/server/layout");
    expect(await getHomeFloors()).toEqual([
      { categoryId: 3, style: "list", limit: 4, title: undefined },
      { categoryId: 5, style: "feature", limit: 7, title: "产品精选" },
    ]);
    await cleanup();
  });

  it("{floors:[...]} 包装形状兼容读取", async () => {
    await writeFloors({ floors: [{ categoryId: 1, style: "grid3", limit: 6 }] });
    const { getHomeFloors } = await import("@/server/layout");
    expect(await getHomeFloors()).toEqual([{ categoryId: 1, style: "grid3", limit: 6, title: undefined }]);
    await cleanup();
  });

  it("逐条容错:非法条目跳过、非法 style 回退 grid3、limit 收敛 1~12、缺省 limit=6", async () => {
    await writeFloors([
      null,
      "junk",
      { style: "list" }, // 缺 categoryId → 跳过
      { categoryId: -1 }, // 非法 → 跳过
      { categoryId: 2, style: "space" }, // style 回退 grid3
      { categoryId: 3, limit: 99 }, // clamp 12
      { categoryId: 4, limit: 0 }, // 缺省 6
      { categoryId: 5, title: "  " }, // 空白 title → undefined
      { categoryId: 6, title: "x".repeat(80) }, // title 截断 60
    ]);
    const { getHomeFloors } = await import("@/server/layout");
    const floors = await getHomeFloors();
    expect(floors).toHaveLength(5);
    expect(floors[0]).toMatchObject({ categoryId: 2, style: "grid3", limit: 6 });
    expect(floors[1]).toMatchObject({ categoryId: 3, limit: 12 });
    expect(floors[2]).toMatchObject({ categoryId: 4, limit: 6 });
    expect(floors[3]).toMatchObject({ categoryId: 5, title: undefined });
    expect(floors[4]!.title).toHaveLength(60);
    await cleanup();
  });

  it("visible=false 条目不返回;楼层上限 8", async () => {
    await writeFloors([
      { categoryId: 1, visible: false },
      { categoryId: 2, visible: true },
      ...Array.from({ length: 10 }, (_, i) => ({ categoryId: 10 + i })),
    ]);
    const { getHomeFloors, FLOOR_MAX } = await import("@/server/layout");
    const floors = await getHomeFloors();
    expect(floors.some((f) => f.categoryId === 1)).toBe(false);
    expect(floors.some((f) => f.categoryId === 2)).toBe(true);
    expect(floors).toHaveLength(FLOOR_MAX);
    await cleanup();
  });
});

describe("国内引擎白名单增补(C3)", () => {
  it("新增国内引擎 UA 识别", async () => {
    const { matchBot } = await import("@/server/geo");
    expect(matchBot("Mozilla/5.0 Kimibot/1.0 (+https://kimi.moonshot.cn/bot)")).toBe("KimiBot (月之暗面 Kimi)");
    expect(matchBot("Kimi-SearchBot/1.0")).toBe("Kimi-SearchBot (Kimi 检索)");
    expect(matchBot("Mozilla/5.0 kimi-user/1.0")).toBe("Kimi-User (Kimi 用户触发)");
    expect(matchBot("ChatGLM-Spider/1.0 (+https://chatglm.cn)")).toBe("ChatGLM-Spider (智谱清言)");
    expect(matchBot("TongyiBot/1.0 (+https://tongye.aliyun.com)")).toBe("TongyiBot (阿里通义)");
    expect(matchBot("Mozilla/5.0 PanguBot/1.0")).toBe("PanguBot (华为盘古)");
    expect(matchBot("Mozilla/5.0 (Macintosh) Chrome/126.0")).toBeNull();
  });

  it("AI_BOTS 下拉数据源含全部新增引擎", async () => {
    const { AI_BOTS } = await import("@/server/geo");
    const names = AI_BOTS.map((b) => b.name);
    expect(names).toContain("KimiBot (月之暗面 Kimi)");
    expect(names).toContain("ChatGLM-Spider (智谱清言)");
    expect(names).toContain("TongyiBot (阿里通义)");
    expect(names).toContain("PanguBot (华为盘古)");
  });
});
