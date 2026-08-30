import { describe, expect, it } from "vitest";

/**
 * 测试基建冒烟(REQ-013 / AC-017 / TEST-000):
 * 证明 vitest 可运行、'@' 别名可解析、临时 SQLite 测试库已应用全部迁移。
 */
describe("测试基建冒烟", () => {
  it("vitest 运行器与断言库可用", () => {
    expect(1 + 1).toBe(2);
  });

  it("'@' 路径别名可解析到 src/", async () => {
    const mod = await import("@/lib/utils");
    expect(mod).toBeTruthy();
  });

  it("临时 SQLite 测试库已应用全部迁移(可建查询)", async () => {
    const { prisma } = await import("@/lib/db");
    // baseline_init 迁移建立的核心表应存在且为空库
    const [users, contents, settings] = await Promise.all([
      prisma.user.count(),
      prisma.content.count(),
      prisma.setting.count(),
    ]);
    expect(users).toBe(0);
    expect(contents).toBe(0);
    expect(settings).toBe(0);
    await prisma.$disconnect();
  });
});
