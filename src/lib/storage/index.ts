import { mkdir, writeFile, unlink, stat } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { buildImageVariants } from "@/lib/storage/variants";
import { getUploadConfig, VIDEO_MAX_SIZE_MB } from "@/lib/config";

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
  /** 分享伴生图(V4.7.4,JPG ≤1200):专供 og:image —— 微信分享卡不吃 WebP;无则未生成 */
  shareRelPath?: string;
  shareSize?: number;
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
  // 视频体积普遍较大,单独放宽(400MB);其余类型沿用后台配置上限
  const limitMB = input.mime.startsWith("video/") ? VIDEO_MAX_SIZE_MB : cfg.maxSizeMB;
  const maxBytes = limitMB * 1024 * 1024;
  if (input.buffer.length > maxBytes) {
    throw new Error(`文件超过大小限制(${limitMB}MB)`);
  }

  let buffer = input.buffer;
  let outMime = input.mime; // V4.7.4:转 WebP 显示版时随之变为 image/webp
  let width: number | null = null;
  let height: number | null = null;

  // 图片压缩(gif 动图 / svg 矢量图 / ico 图标跳过 —— svg 是矢量文本格式、ico 是多尺寸容器格式,
  // sharp 均无法处理,原样保存)
  let shareRelPath: string | undefined;
  let shareSize: number | undefined;
  // uuid 与日期目录先行,分享伴生命名派生自显示版同一 uuid(V4.8.4 修):
  // og:image 的伴生匹配只认 <stem>-share.jpg / <stem>.jpg(open-graph.ts,与回填脚本同约定),
  // 此前伴生用独立 UUID 命名 → 新上传封面的 og 永远匹配不到伴生,分享卡退化用 WebP 本体或兜底图
  const now = new Date();
  const dir = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
  const uuid = crypto.randomUUID();
  const isImage =
    input.mime.startsWith("image/") &&
    input.mime !== "image/gif" &&
    input.mime !== "image/svg+xml" &&
    !ICO_MIMES.includes(input.mime);
  if (isImage) {
    // 解码校验保留在此(带友好报错);变体生成见 ./variants(V4.7.4 单一来源,可单测)
    try {
      const meta = await sharp(buffer, { failOn: "none" }).metadata();
      if (!meta.format) throw new Error("unrecognized image");
    } catch {
      throw new Error("图片文件无法识别或已损坏,请上传有效的图片文件");
    }
    const variants = await buildImageVariants({ buffer, mime: input.mime });
    if (variants) {
      buffer = variants.display.buffer;
      outMime = "image/webp"; // 内容与扩展名/mime 必须一致(favicon 黑块同类事故的防范)
      width = variants.width;
      height = variants.height;
      if (variants.share) {
        shareRelPath = `${dir}/${uuid}-share.jpg`;
        const shareAbs = path.join(uploadRoot(), shareRelPath);
        await mkdir(path.dirname(shareAbs), { recursive: true });
        await writeFile(shareAbs, variants.share.buffer);
        shareSize = variants.share.buffer.length;
      }
    } else {
      // 未产出变体:沿用旧尺寸读取(保留原图时也需要宽高)
      try {
        const m = await sharp(buffer, { failOn: "none" }).metadata();
        width = m.width ?? null;
        height = m.height ?? null;
      } catch {
        /* 不可解码已在上面拦截 */
      }
    }
  }

  // 扩展名在重编码定案后取(转 WebP 后必须是 .webp,内容与扩展名/mime 一致)
  const ext =
    EXT_BY_MIME[outMime] ||
    path.extname(input.originalName).replace(".", "").toLowerCase() ||
    "bin";
  const rel = `${dir}/${uuid}.${ext}`;
  const abs = path.join(uploadRoot(), rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, buffer);

  return {
    relPath: rel.replace(/\\/g, "/"),
    filename: input.originalName,
    mime: outMime,
    size: buffer.length,
    width,
    height,
    ...(shareRelPath ? { shareRelPath, shareSize } : {}),
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
