import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { z } from "zod";
import { jsonOk, jsonErr, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { runBackup, listBackups, deleteBackup, backupFilePath } from "@/server/backup";

/**
 * 备份管理:
 * GET               备份记录列表
 * GET ?download=id  下载备份文件
 * POST {type}       执行备份(db/files/full)
 * DELETE ?id=       删除备份
 */

const postSchema = z.object({ type: z.enum(["db", "files", "full"]) });

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const sp = new URL(req.url).searchParams;
  const downloadId = sp.get("download");

  if (downloadId) {
    const records = await listBackups();
    const record = records.find((r) => r.id === Number(downloadId));
    if (!record) return jsonErr("备份不存在", 404);
    const abs = backupFilePath(record.path);
    if (!abs) return jsonErr("路径非法", 400);
    try {
      const s = await stat(abs);
      const stream = Readable.toWeb(createReadStream(abs)) as ReadableStream;
      return new Response(stream, {
        headers: {
          "content-type": "application/octet-stream",
          "content-length": String(s.size),
          "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(record.path)}`,
        },
      });
    } catch {
      return jsonErr("备份文件已丢失", 404);
    }
  }

  return jsonOk(await listBackups());
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const parsed = await parseBody(req, postSchema);
  if (parsed.error) return parsed.error;
  try {
    const record = await runBackup(parsed.data.type);
    return jsonOk(record);
  } catch (e) {
    return jsonErr(e instanceof Error ? e.message : "备份失败");
  }
}

export async function DELETE(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return jsonErr("缺少 id");
  await deleteBackup(id);
  return jsonOk();
}
