import { mkdir, writeFile, unlink, stat } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { getUploadConfig } from "@/lib/config";

/**
 * 本地文件存储(硬性边界:禁止任何云存储)。
 * 目录结构:uploads/yyyy/MM/<uuid>.<ext>
 * 图片自动压缩(超宽缩放 + 重编码),视频/附件原样保存。
 */

/** uploads 根目录(绝对路径) */
export function uploadRoot(): string {
  return path.resolve(process.cwd(), process.env.UPLOAD_DIR || "./uploads");
}

/** 备份根目录(绝对路径) */
export function backupRoot(): string {
  return path.resolve(process.cwd(), process.env.BACKUP_DIR || "./backups");
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-matroska": "mkv",
  "application/pdf": "pdf",
};

/**
 * ICO(favicon 场景)始终放行,不受后台 upload.allowedTypes 配置影响:
 * 旧部署库里已存在的 allowedTypes 不含 ICO(seed 只补缺失、不覆盖已有项),
 * 若在配置层拦截,ICO 图标上传会在老库上一直被拒。
 */
const ICO_MIMES = ["image/x-icon", "image/vnd.microsoft.icon"];

export interface SavedFile {
  relPath: string; // 相对 uploads/ 的路径(URL 用)
  filename: string; // 原始文件名(展示用)
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
}

/**
 * 校验并保存上传文件。
 * - 类型/大小限制读取后台配置(Setting.upload)
 * - 图片:>2560px 等比缩小,jpeg/png/webp 重编码(质量 80)
 * @throws Error 携带对用户友好的中文信息
 */
export async function saveUpload(input: {
  buffer: Buffer;
  originalName: string;
  mime: string;
}): Promise<SavedFile> {
  const cfg = await getUploadConfig();

  if (!cfg.allowedTypes.includes(input.mime) && !ICO_MIMES.includes(input.mime)) {
    throw new Error(`不允许的文件类型:${input.mime}`);
  }
  const maxBytes = cfg.maxSizeMB * 1024 * 1024;
  if (input.buffer.length > maxBytes) {
    throw new Error(`文件超过大小限制(${cfg.maxSizeMB}MB)`);
  }

  let buffer = input.buffer;
  let width: number | null = null;
  let height: number | null = null;

  // 图片压缩(gif 动图 / svg 矢量图 / ico 图标跳过 —— svg 是矢量文本格式、ico 是多尺寸容器格式,
  // sharp 均无法处理,原样保存)
  const isImage =
    input.mime.startsWith("image/") &&
    input.mime !== "image/gif" &&
    input.mime !== "image/svg+xml" &&
    !ICO_MIMES.includes(input.mime);
  if (isImage) {
    try {
      let img = sharp(buffer, { failOn: "none" });
      const meta = await img.metadata();
      // 声明为图片但无法解码(典型:把 .ico 改名 .png 绕过校验)→ 拒绝,
      // 避免产出"扩展名/mime 与真实内容不符"的脏文件(favicon 黑块缺陷的根因)
      if (!meta.format) throw new Error("unrecognized image");
      if (meta.width && meta.width > 2560) img = img.resize({ width: 2560 });
      if (input.mime === "image/jpeg") buffer = Buffer.from(await img.jpeg({ quality: 80 }).toBuffer());
      else if (input.mime === "image/png") buffer = Buffer.from(await img.png({ compressionLevel: 8 }).toBuffer());
      else if (input.mime === "image/webp") buffer = Buffer.from(await img.webp({ quality: 80 }).toBuffer());
      const outMeta = await sharp(buffer).metadata();
      width = outMeta.width ?? null;
      height = outMeta.height ?? null;
    } catch {
      throw new Error("图片文件无法识别或已损坏,请上传有效的图片文件");
    }
  }

  const now = new Date();
  const ext =
    EXT_BY_MIME[input.mime] || path.extname(input.originalName).replace(".", "").toLowerCase() || "bin";
  const rel = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.${ext}`;
  const abs = path.join(uploadRoot(), rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, buffer);

  return {
    relPath: rel.replace(/\\/g, "/"),
    filename: input.originalName,
    mime: input.mime,
    size: buffer.length,
    width,
    height,
  };
}

/** 删除物理文件(容错:不存在不报错) */
export async function removeUploadFile(relPath: string): Promise<void> {
  const abs = safeResolve(relPath);
  if (!abs) return;
  try {
    await unlink(abs);
  } catch {
    /* 已不存在 */
  }
}

/**
 * 把相对路径安全解析为 uploads 内的绝对路径。
 * 防路径穿越:解析结果必须仍在 uploads 根内,否则返回 null。
 */
export function safeResolve(relPath: string): string | null {
  const root = uploadRoot();
  const abs = path.resolve(root, relPath);
  if (!abs.startsWith(root + path.sep) && abs !== root) return null;
  return abs;
}

/** 读取文件大小(不存在返回 null) */
export async function fileSize(absPath: string): Promise<number | null> {
  try {
    return (await stat(absPath)).size;
  } catch {
    return null;
  }
}
