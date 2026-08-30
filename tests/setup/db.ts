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

execSync("npx prisma migrate deploy", {
  cwd: path.resolve(__dirname, "../.."),
  env: { ...process.env },
  stdio: "pipe",
});

afterAll(() => {
  try {
    rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // 清理失败不影响测试结论(临时目录由操作系统回收)
  }
});
