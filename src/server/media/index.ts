import { prisma } from "@/lib/db";
import { saveUpload, removeUploadFile } from "@/lib/storage";

/**
 * 媒体资产服务:上传登记 / 列表 / 删除。
 * 所有上传统一经此登记 MediaAsset,便于后台文件管理与 alt 维护。
 */

export interface UploadMeta {
  uploaderType: "admin" | "user" | "form";
  uploaderId?: number | null;
  alt?: string;
}

/** 保存文件并登记资产,返回含访问 URL 的记录 */
export async function createMedia(
  input: { buffer: Buffer; originalName: string; mime: string },
  meta: UploadMeta
) {
  const saved = await saveUpload(input);
  const asset = await prisma.mediaAsset.create({
    data: {
      path: saved.relPath,
      filename: saved.filename,
      mime: saved.mime,
      size: saved.size,
      width: saved.width,
      height: saved.height,
      alt: meta.alt || saved.filename.replace(/\.[^.]+$/, ""), // 默认用文件名做 alt,后台可改
      uploaderType: meta.uploaderType,
      uploaderId: meta.uploaderId ?? null,
    },
  });
  return { ...asset, url: `/uploads/${asset.path}` };
}

/** 分页列出媒体资产 */
export async function listMedia(opts: { page?: number; pageSize?: number; mime?: string }) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, opts.pageSize ?? 24);
  const where = opts.mime ? { mime: { startsWith: opts.mime } } : {};
  const [total, items] = await Promise.all([
    prisma.mediaAsset.count({ where }),
    prisma.mediaAsset.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return {
    total,
    page,
    pageSize,
    items: items.map((a) => ({ ...a, url: `/uploads/${a.path}` })),
  };
}

/** 更新 alt(SEO 语义) */
export async function updateMediaAlt(id: number, alt: string) {
  return prisma.mediaAsset.update({ where: { id }, data: { alt } });
}

/** 删除资产(物理文件 + 记录) */
export async function deleteMedia(id: number) {
  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!asset) return;
  await removeUploadFile(asset.path);
  await prisma.mediaAsset.delete({ where: { id } });
}
