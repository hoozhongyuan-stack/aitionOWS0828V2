import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll } from "vitest";

/**
 * 全局测试库夹具(REQ-013):每个 vitest 进程创建一个临时 SQLite 库,
 * 依序应用 prisma/migrations 下全部迁移(与生产 prisma migrate deploy 同路径),
 * 测试结束后删除。业务测试通过 import { prisma } from "@/lib/db" 访问该库。
 *
 * 注意:DATABASE_URL 必须在首次加载 @/lib/db 之前设置;
 * 测试文件请用动态 import(见 tests/smoke.test.ts 示例)。
 */

const TMP_DIR = mkdtempSync(path.join(tmpdir(), "aitionows-test-"));
const DB_FILE = path.join(TMP_DIR, "test.db");

process.env.DATABASE_URL = `file:${DB_FILE}`;

/** 临时测试库绝对路径与 DATABASE_URL(导出供集成测试派生子进程时注入,如 TEST-019 dev server) */
export const TEST_DB_PATH = DB_FILE;
export const TEST_DB_URL = process.env.DATABASE_URL;

execSync("npx prisma migrate deploy", {
  cwd: path.resolve(__dirname, "../.."),
  env: { ...process.env },
  stdio: "pipe",
});

// V4.1 权限守卫(requireOwner/requirePerm)查库校验角色——测试统一种子一个 OWNER(id=1),
// 与各测试文件 signToken({ sub: "1", typ: "admin" }) 的约定一致。
// passwordHash 任意串(测试不走密码校验路径)。
try {
  const { PrismaClient } = require("@prisma/client");
  const seedDb = new PrismaClient();
  seedDb.adminUser
    .upsert({
      where: { username: "admin" },
      update: { role: "OWNER", status: "ACTIVE" },
      create: { id: 1, username: "admin", passwordHash: "test-only", displayName: "测试管理员", role: "OWNER", status: "ACTIVE" },
    })
    .then(() => seedDb.$disconnect())
    .catch(() => seedDb.$disconnect());
} catch {
  // 种子失败不影响「不依赖守卫查库」的旧测试
}

afterAll(() => {
  try {
    rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // 清理失败不影响测试结论(临时目录由操作系统回收)
  }
});
