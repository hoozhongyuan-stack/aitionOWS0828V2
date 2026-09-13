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
  meta: UploadMeta & { folderId?: number | null } // V4.2:上传时可归档到文件夹
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
      folderId: meta.folderId ?? null,
    },
  });
  return { ...asset, url: `/uploads/${asset.path}` };
}

/**
 * 分页列出媒体资产(V4.6.5:支持 folderId/keyword —— 此前仅 picker 分支支持,
 * 普通列表传参被静默忽略,导致「切换分组右侧不变、搜索无效」)。
 * folderId 语义:undefined=全部;null=未分类;数字=该文件夹(合并其子文件夹,与 picker 一致)。
 */
export async function listMedia(opts: {
  page?: number;
  pageSize?: number;
  mime?: string;
  folderId?: number | null;
  keyword?: string;
}) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, opts.pageSize ?? 24);
  const where: Record<string, unknown> = {};
  if (opts.folderId !== undefined) {
    where.folderId =
      opts.folderId === null
        ? null
        : {
            in: [
              opts.folderId,
              ...(await prisma.mediaFolder.findMany({ where: { parentId: opts.folderId }, select: { id: true } })).map(
                (c) => c.id
              ),
            ],
          };
  }
  if (opts.mime) where.mime = { startsWith: opts.mime };
  const kw = opts.keyword?.trim();
  if (kw) where.filename = { contains: kw };
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

// ============================================================
// V4.2 媒体文件夹(二级)与素材选择器数据
// ============================================================

/** 文件夹树(两级):一级 + children */
export async function listFolders() {
  const all = await prisma.mediaFolder.findMany({ orderBy: [{ sort: "asc" }, { id: "asc" }] });
  const roots = all.filter((f) => f.parentId == null);
  return roots.map((r) => ({ ...r, children: all.filter((c) => c.parentId === r.id) }));
}

/**
 * 各文件夹的真实文件数(V4.6.5):一级 = 自身 + 其子文件夹合计;另返回未分类计数。
 * 取代页面此前 `children.length + 1` 的占位算法。
 */
export async function getFolderCounts(): Promise<{ unassigned: number; byId: Record<number, number> }> {
  const [unassigned, grouped, folders] = await Promise.all([
    prisma.mediaAsset.count({ where: { folderId: null } }),
    prisma.mediaAsset.groupBy({ by: ["folderId"], _count: { _all: true } }),
    prisma.mediaFolder.findMany({ select: { id: true, parentId: true } }),
  ]);
  const direct = new Map<number, number>();
  for (const g of grouped) {
    if (g.folderId != null) direct.set(g.folderId, g._count._all);
  }
  const byId: Record<number, number> = {};
  for (const f of folders) {
    let n = direct.get(f.id) ?? 0;
    if (f.parentId == null) {
      // 一级文件夹:合计其所有子文件夹
      for (const c of folders) {
        if (c.parentId === f.id) n += direct.get(c.id) ?? 0;
      }
    }
    byId[f.id] = n;
  }
  return { unassigned, byId };
}

/** 创建文件夹(parentId 仅允许一级 id——二级封顶);同名同级拒绝 */
export async function createFolder(name: string, parentId?: number | null) {
  const trimmed = name.trim().slice(0, 40);
  if (!trimmed) throw new Error("请输入文件夹名称");
  if (parentId != null) {
    const parent = await prisma.mediaFolder.findUnique({ where: { id: parentId } });
    if (!parent) throw new Error("上级文件夹不存在");
    if (parent.parentId != null) throw new Error("仅支持两级文件夹");
  }
  const siblings = await prisma.mediaFolder.findMany({
    where: { name: trimmed, parentId: parentId ?? null },
  });
  if (siblings.length) throw new Error("同级已存在同名文件夹");
  return prisma.mediaFolder.create({ data: { name: trimmed, parentId: parentId ?? null } });
}

/** 重命名文件夹 */
export async function renameFolder(id: number, name: string) {
  const trimmed = name.trim().slice(0, 40);
  if (!trimmed) throw new Error("请输入文件夹名称");
  const row = await prisma.mediaFolder.findUnique({ where: { id } });
  if (!row) throw new Error("文件夹不存在");
  await prisma.mediaFolder.update({ where: { id }, data: { name: trimmed } });
}

/** 删除文件夹:非空(含素材或子文件夹)禁止,提示先移走(防误删引用) */
export async function deleteFolder(id: number) {
  const hasChildren = await prisma.mediaFolder.count({ where: { parentId: id } });
  if (hasChildren) throw new Error("该文件夹包含子文件夹,请先移走");
  const hasAssets = await prisma.mediaAsset.count({ where: { folderId: id } });
  if (hasAssets) throw new Error("该文件夹内仍有文件,请先移走或删除");
  await prisma.mediaFolder.delete({ where: { id } });
}

/** 素材列表(素材选择器/文件页共用):按文件夹过滤(null=未分类),图片置前按时间倒序 */
export async function listAssetsForPicker(opts: { folderId?: number | null; mime?: string; page?: number; pageSize?: number; keyword?: string }) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 24));
  const where: Record<string, unknown> = {};
  if (opts.folderId === undefined || opts.folderId === null) {
    where.folderId = null;
  } else {
    where.folderId = { in: [opts.folderId, ...(await prisma.mediaFolder.findMany({ where: { parentId: opts.folderId }, select: { id: true } })).map((c) => c.id)] };
  }
  if (opts.mime) where.mime = { startsWith: opts.mime };
  const kw = opts.keyword?.trim();
  if (kw) where.filename = { contains: kw };
  const [total, items] = await Promise.all([
    prisma.mediaAsset.count({ where }),
    prisma.mediaAsset.findMany({
      where,
      orderBy: [{ id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { total, page, pageSize, items };
}

/** 移动素材到文件夹(文件页/选择器内可用) */
export async function moveAssets(ids: number[], folderId: number | null) {
  await prisma.mediaAsset.updateMany({ where: { id: { in: ids } }, data: { folderId } });
}
