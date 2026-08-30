import { execSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * TEST-017(对应 AC-015 / NFR-003):V3.0 迁移演练。
 *
 * 流程:在临时目录用"仅含既有迁移(baseline_init + form_submission_status)"
 * 的迁移子集重建旧结构库 → $executeRaw 植入代表性存量数据(显式旧列 INSERT,
 * 避免新 Prisma Client 的 create() 带上新列导致旧库报错)→ 对同一 DATABASE_URL
 * 用真实 prisma/schema.prisma + 全迁移目录执行 migrate deploy(此时应只应用
 * V3.0 新迁移)→ 断言存量无损、新列空值/默认值、Favorite 唯一约束、迁移幂等。
 *
 * 注意:本测试自建独立临时库,不使用 tests/setup/db.ts 的全局测试库;
 * DATABASE_URL 随"旧库→新库"两阶段不变,但 Prisma Client 为模块级单例
 * (读启动时 env),因此这里用独立实例(datasourceUrl 显式覆盖),不 import 全局单例。
 */

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const REAL_SCHEMA = path.join(PROJECT_ROOT, "prisma", "schema.prisma");
const REAL_MIGRATIONS = path.join(PROJECT_ROOT, "prisma", "migrations");

// 应用 V3.0 迁移前的既有迁移(baseline_init + form_submission_status)
const LEGACY_MIGRATIONS = [
  "20260827000000_baseline_init",
  "20260828010000_form_submission_status",
];

let tmpDir: string;
const dbFile = (): string => path.join(tmpDir, "legacy.db");
const dbUrl = (): string => `file:${dbFile()}`;

/** 对指定 schema 执行 prisma migrate deploy(DATABASE_URL 用 env 注入) */
function deploy(schemaPath: string): void {
  execSync(`npx prisma migrate deploy --schema "${schemaPath}"`, {
    cwd: PROJECT_ROOT,
    env: { ...process.env, DATABASE_URL: dbUrl() },
    stdio: "pipe",
  });
}

describe("TEST-017: V3.0 迁移演练(存量无损/新列默认值/幂等)", () => {
  beforeAll(async () => {
    // a. 临时目录:复制真实 schema + 仅含旧迁移的 migrations 子集
    tmpDir = mkdtempSync(path.join(tmpdir(), "aitionows-migration-"));
    const tmpPrismaDir = path.join(tmpDir, "prisma");
    const tmpMigrations = path.join(tmpPrismaDir, "migrations");
    mkdirSync(tmpMigrations, { recursive: true });
    cpSync(REAL_SCHEMA, path.join(tmpPrismaDir, "schema.prisma"));
    for (const m of LEGACY_MIGRATIONS) {
      cpSync(path.join(REAL_MIGRATIONS, m), path.join(tmpMigrations, m), {
        recursive: true,
      });
    }
    cpSync(path.join(REAL_MIGRATIONS, "migration_lock.toml"), path.join(tmpMigrations, "migration_lock.toml"));

    // 建立旧结构(deploy 自动在 _prisma_migrations 登记两条旧迁移,无需伪造)
    deploy(path.join(tmpPrismaDir, "schema.prisma"));

    // b. 植入代表性存量数据(显式旧列 INSERT;必须 await,避免与后续 deploy 竞态)
    const legacy = new PrismaClient({ datasourceUrl: dbUrl() });
    await legacy.$transaction([
      legacy.$executeRawUnsafe(
        `INSERT INTO "Category" ("slug", "moduleType") VALUES ('cat', 'news')`,
      ),
      legacy.$executeRawUnsafe(
        `INSERT INTO "User" ("email", "nickname", "status") VALUES ('legacy@example.com', '老用户', 'ACTIVE')`,
      ),
      legacy.$executeRawUnsafe(
        `INSERT INTO "Content" ("slug", "categoryId", "status", "source", "viewCount", "likeCount", "shareCount", "updatedAt") VALUES ('legacy-post', 1, 'PUBLISHED', 'ADMIN', 7, 3, 1, CURRENT_TIMESTAMP)`,
      ),
      legacy.$executeRawUnsafe(
        `INSERT INTO "Setting" ("group", "key", "value", "updatedAt") VALUES ('theme', 'primaryColor', '"#1890ff"', CURRENT_TIMESTAMP)`,
      ),
    ]);
    await legacy.$disconnect();
  });

  afterAll(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // 清理失败不影响测试结论(临时目录由操作系统回收)
    }
  });

  it("应用 V3.0 迁移后:存量数据无损、新列空值/默认值、Favorite 唯一约束、迁移幂等", async () => {
    // c. 同一 DATABASE_URL 应用全迁移目录(此时应只应用 V3.0 新迁移)
    deploy(REAL_SCHEMA);

    const migrated = new PrismaClient({ datasourceUrl: dbUrl() });
    try {
      // d1. 旧行完好(业务字段与互动计数不变)
      const user = await migrated.user.findFirst();
      expect(user?.email).toBe("legacy@example.com");
      expect(user?.nickname).toBe("老用户");
      expect(user?.status).toBe("ACTIVE");

      const content = await migrated.content.findFirst();
      expect(content?.slug).toBe("legacy-post");
      expect(content?.status).toBe("PUBLISHED");
      expect(content?.source).toBe("ADMIN");
      expect(content?.viewCount).toBe(7);
      expect(content?.likeCount).toBe(3);
      expect(content?.shareCount).toBe(1);

      const setting = await migrated.setting.findFirst();
      expect(setting?.group).toBe("theme");
      expect(setting?.key).toBe("primaryColor");
      expect(setting?.value).toBe('"#1890ff"');

      // d2. 新列取空值/默认值
      expect(user?.companyName).toBeNull();
      expect(user?.country).toBeNull();
      expect(user?.province).toBeNull();
      expect(user?.city).toBeNull();
      expect(content?.favoriteCount).toBe(0);
      expect(content?.gallery).toBeNull();
      expect(content?.specs).toBeNull();

      // d3. Favorite 新表存在且为空
      expect(await migrated.favorite.count()).toBe(0);

      // d4. 同一 (targetType, targetId, userId) 二次插入触发 P2002 唯一冲突
      await migrated.favorite.create({
        data: { targetType: "CONTENT", targetId: content!.id, userId: user!.id },
      });
      let dupCode: string | undefined;
      try {
        await migrated.favorite.create({
          data: { targetType: "CONTENT", targetId: content!.id, userId: user!.id },
        });
        dupCode = "NO_ERROR";
      } catch (error) {
        dupCode = (error as { code?: string }).code;
      }
      expect(dupCode).toBe("P2002");
      expect(await migrated.favorite.count()).toBe(1);

      // e. 幂等:重复 migrate deploy 退出码 0 且数据不变
      expect(() => deploy(REAL_SCHEMA)).not.toThrow();
      expect(await migrated.user.count()).toBe(1);
      expect(await migrated.content.count()).toBe(1);
      expect(await migrated.setting.count()).toBe(1);
      expect(await migrated.favorite.count()).toBe(1);
      expect((await migrated.content.findFirst())?.favoriteCount).toBe(0);
    } finally {
      await migrated.$disconnect();
    }
  });
});
