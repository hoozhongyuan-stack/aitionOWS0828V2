import { execSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * TEST-201(对应 AC-003 / REQ-002 / NFR-001):V3.1 迁移演练(规格表英文化)。
 *
 * 流程:在临时目录用「仅含既有迁移(baseline_init + form_submission_status + v3)」
 * 的迁移子集重建旧结构库 → $executeRaw 植入代表性存量数据(Category / Content
 * 含 specs JSON 串与无 specs 两种 / ContentTranslation zh+en 两行)→ 对同一
 * DATABASE_URL 用真实 prisma/schema.prisma + 全迁移目录执行 migrate deploy
 * (此时应只应用 V3.1 新迁移)→ 断言:旧行保留、各翻译行 specs == 对应主表
 * specs 副本(无 specs 则 NULL)、重复 deploy 幂等。
 *
 * 注意:本测试自建独立临时库,不使用 tests/setup/db.ts 的全局测试库;
 * DATABASE_URL 随「旧库→新库」两阶段不变,但 Prisma Client 为模块级单例
 * (读启动时 env),因此这里用独立实例(datasourceUrl 显式覆盖),不 import 全局单例。
 */

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const REAL_SCHEMA = path.join(PROJECT_ROOT, "prisma", "schema.prisma");
const REAL_MIGRATIONS = path.join(PROJECT_ROOT, "prisma", "migrations");

// 应用 V3.1 迁移前的既有迁移子集(V3.0 三条迁移全部为既有先例)
const LEGACY_MIGRATIONS = [
  "20260827000000_baseline_init",
  "20260828010000_form_submission_status",
  "20260830120000_v3_product_favorite_user_profile",
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

describe("TEST-201: V3.1 迁移演练(specs 回填/存量无损/幂等)", () => {
  beforeAll(async () => {
    // a. 临时目录:复制真实 schema + 仅含旧迁移的 migrations 子集
    tmpDir = mkdtempSync(path.join(tmpdir(), "aitionows-migration-v31-"));
    const tmpPrismaDir = path.join(tmpDir, "prisma");
    const tmpMigrations = path.join(tmpPrismaDir, "migrations");
    mkdirSync(tmpMigrations, { recursive: true });
    cpSync(REAL_SCHEMA, path.join(tmpPrismaDir, "schema.prisma"));
    for (const m of LEGACY_MIGRATIONS) {
      cpSync(path.join(REAL_MIGRATIONS, m), path.join(tmpMigrations, m), {
        recursive: true,
      });
    }
    cpSync(
      path.join(REAL_MIGRATIONS, "migration_lock.toml"),
      path.join(tmpMigrations, "migration_lock.toml")
    );

    // 建立旧结构(deploy 自动在 _prisma_migrations 登记三条旧迁移,无需伪造)
    deploy(path.join(tmpPrismaDir, "schema.prisma"));

    // b. 植入代表性存量数据(显式旧列 INSERT;必须 await,避免与后续 deploy 竞态)
    //    - content-with-specs:主表 specs 有值,zh+en 两个翻译行 → 迁移后两行都应为主表副本
    //    - content-no-specs:主表 specs 为 NULL,翻译行 → 迁移后 specs 应为 NULL
    const legacy = new PrismaClient({ datasourceUrl: dbUrl() });
    await legacy.$transaction([
      legacy.$executeRawUnsafe(
        `INSERT INTO "Category" ("slug", "moduleType") VALUES ('v31-cat', 'product')`
      ),
      legacy.$executeRawUnsafe(
        `INSERT INTO "Content" ("slug", "categoryId", "status", "source", "viewCount", "likeCount", "shareCount", "favoriteCount", "specs", "updatedAt") VALUES ('v31-with-specs', 1, 'PUBLISHED', 'ADMIN', 7, 3, 1, 0, '[{"k":"型号","v":"AX-100"},{"k":"材质","v":"铝合金"}]', CURRENT_TIMESTAMP)`
      ),
      legacy.$executeRawUnsafe(
        `INSERT INTO "Content" ("slug", "categoryId", "status", "source", "viewCount", "likeCount", "shareCount", "favoriteCount", "specs", "updatedAt") VALUES ('v31-no-specs', 1, 'PUBLISHED', 'ADMIN', 1, 0, 0, 0, NULL, CURRENT_TIMESTAMP)`
      ),
      legacy.$executeRawUnsafe(
        `INSERT INTO "ContentTranslation" ("contentId", "locale", "title", "body") VALUES (1, 'zh-CN', '规格商品', '<p>中文正文</p>')`
      ),
      legacy.$executeRawUnsafe(
        `INSERT INTO "ContentTranslation" ("contentId", "locale", "title", "body") VALUES (1, 'en', 'Spec Product', '<p>english body</p>')`
      ),
      legacy.$executeRawUnsafe(
        `INSERT INTO "ContentTranslation" ("contentId", "locale", "title", "body") VALUES (2, 'zh-CN', '无规格商品', '<p>正文</p>')`
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

  it("应用 V3.1 迁移后:旧行保留、翻译行 specs=主表副本(无则 NULL)、重复 deploy 幂等", async () => {
    // c. 同一 DATABASE_URL 应用全迁移目录(此时应只应用 V3.1 新迁移)
    deploy(REAL_SCHEMA);

    const migrated = new PrismaClient({ datasourceUrl: dbUrl() });
    try {
      // d1. 旧行完好(slug/状态/互动计数/翻译标题正文不变)
      const withSpecs = await migrated.content.findUnique({
        where: { slug: "v31-with-specs" },
        include: { translations: true },
      });
      expect(withSpecs?.status).toBe("PUBLISHED");
      expect(withSpecs?.viewCount).toBe(7);
      expect(withSpecs?.likeCount).toBe(3);
      expect(withSpecs?.shareCount).toBe(1);
      expect(withSpecs?.translations).toHaveLength(2);
      expect(withSpecs?.translations.find((t) => t.locale === "zh-CN")?.title).toBe("规格商品");
      expect(withSpecs?.translations.find((t) => t.locale === "en")?.title).toBe("Spec Product");
      expect(withSpecs?.translations.find((t) => t.locale === "en")?.body).toBe(
        "<p>english body</p>"
      );

      const noSpecs = await migrated.content.findUnique({
        where: { slug: "v31-no-specs" },
        include: { translations: true },
      });
      expect(noSpecs).toBeTruthy();

      // d2. 回填:主表有 specs → 每个翻译行 specs == 主表 specs 副本(原样 JSON 串)
      const mainSpecs = withSpecs?.specs;
      expect(mainSpecs).toBe('[{"k":"型号","v":"AX-100"},{"k":"材质","v":"铝合金"}]');
      expect(withSpecs?.translations.find((t) => t.locale === "zh-CN")?.specs).toBe(mainSpecs);
      expect(withSpecs?.translations.find((t) => t.locale === "en")?.specs).toBe(mainSpecs);

      // d3. 回填:主表无 specs → 翻译行 specs 为 NULL(不是空串/占位)
      expect(noSpecs?.specs).toBeNull();
      expect(noSpecs?.translations.find((t) => t.locale === "zh-CN")?.specs).toBeNull();

      // e. 幂等:重复 migrate deploy 退出码 0 且数据不变(不被二次改写)
      expect(() => deploy(REAL_SCHEMA)).not.toThrow();
      const after = await migrated.content.findUnique({
        where: { slug: "v31-with-specs" },
        include: { translations: true },
      });
      expect(after?.specs).toBe(mainSpecs);
      expect(after?.translations.find((t) => t.locale === "zh-CN")?.specs).toBe(mainSpecs);
      expect(after?.translations.find((t) => t.locale === "en")?.specs).toBe(mainSpecs);
      expect(await migrated.content.count()).toBe(2);
      expect(await migrated.contentTranslation.count()).toBe(3);
    } finally {
      await migrated.$disconnect();
    }
  });
});
