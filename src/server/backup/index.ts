import { createWriteStream, existsSync } from "node:fs";
import { mkdir, unlink, stat } from "node:fs/promises";
import path from "node:path";
import { ZipArchive } from "archiver"; // archiver v8:类导出
import { prisma } from "@/lib/db";
import { uploadRoot, backupRoot } from "@/lib/storage";

/**
 * 一键备份(需求 5):
 * - db:SQLite `VACUUM INTO`(热备一致性,官方推荐)
 * - files:uploads/ 打包 zip
 * - full:db + uploads 一个 zip
 * 产物落 backups/(Docker volume),BackupRecord 登记。
 */

function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** SQLite 热备:VACUUM INTO 输出一致性快照 */
async function backupDbTo(absPath: string): Promise<void> {
  // 路径中的单引号转义,防注入
  const safe = absPath.replace(/'/g, "''").replace(/\\/g, "/");
  await prisma.$executeRawUnsafe(`VACUUM INTO '${safe}'`);
}

/** 把目录/文件打包为 zip */
function zipTo(zipPath: string, add: (archive: ZipArchive) => void): Promise<number> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = new ZipArchive({ zlib: { level: 6 } });
    output.on("close", () => resolve(archive.pointer()));
    archive.on("error", reject);
    archive.pipe(output);
    add(archive);
    void archive.finalize();
  });
}

export async function runBackup(type: "db" | "files" | "full") {
  const root = backupRoot();
  await mkdir(root, { recursive: true });
  const name = `backup-${type}-${stamp()}`;

  let filePath: string;
  if (type === "db") {
    filePath = path.join(root, `${name}.db`);
    await backupDbTo(filePath);
  } else {
    filePath = path.join(root, `${name}.zip`);
    // full 需要先出 db 快照,打包后删除临时文件
    const tmpDb = type === "full" ? path.join(root, `.tmp-${stamp()}.db`) : null;
    if (tmpDb) await backupDbTo(tmpDb);
    await zipTo(filePath, (archive) => {
      if (existsSync(uploadRoot())) archive.directory(uploadRoot(), "uploads");
      if (tmpDb) archive.file(tmpDb, { name: "data/app.db" });
    });
    if (tmpDb) await unlink(tmpDb).catch(() => {});
  }

  const size = (await stat(filePath)).size;
  const record = await prisma.backupRecord.create({
    data: { type, path: path.basename(filePath), size },
  });
  return record;
}

export async function listBackups() {
  return prisma.backupRecord.findMany({ orderBy: { id: "desc" } });
}

/** 备份文件绝对路径(校验在 backups 根内) */
export function backupFilePath(filename: string): string | null {
  const abs = path.resolve(backupRoot(), filename);
  if (!abs.startsWith(backupRoot())) return null;
  return abs;
}

export async function deleteBackup(id: number) {
  const record = await prisma.backupRecord.findUnique({ where: { id } });
  if (!record) return;
  const abs = backupFilePath(record.path);
  if (abs) await unlink(abs).catch(() => {});
  await prisma.backupRecord.delete({ where: { id } });
}
