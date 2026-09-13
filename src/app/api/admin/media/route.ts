import { z } from "zod";
import { logAdmin } from "@/server/admin";
import { jsonOk, jsonErr, parseBody, getClientIp } from "@/lib/api";
import { requirePerm } from "@/lib/auth/session";
import { listMedia, updateMediaAlt, deleteMedia, listFolders, createFolder, renameFolder, deleteFolder, listAssetsForPicker, moveAssets, getFolderCounts } from "@/server/media";

/** 文件管理:GET ?page=&mime=&folderId= 列表+文件夹树 / POST 动作分发(alt/文件夹 CRUD/移动) / DELETE ?id= */

const postSchema = z.object({ id: z.number().int(), alt: z.string().max(200) });

// V4.2 文件夹动作
const folderActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("createFolder"), name: z.string().max(40), parentId: z.number().int().nullable().optional() }),
  z.object({ action: z.literal("renameFolder"), id: z.number().int(), name: z.string().max(40) }),
  z.object({ action: z.literal("deleteFolder"), id: z.number().int() }),
  z.object({ action: z.literal("moveAssets"), ids: z.array(z.number().int()).min(1), folderId: z.number().int().nullable() }),
]);

export async function GET(req: Request) {
  const guard = await requirePerm("content");
  if ("error" in guard) return guard.error;
  const sp = new URL(req.url).searchParams;
  // V4.2 素材选择器模式:picker=1 时按文件夹过滤返回
  if (sp.get("picker") === "1") {
    const folderIdRaw = sp.get("folderId");
    return jsonOk({
      folders: await listFolders(),
      ...(await listAssetsForPicker({
        folderId: folderIdRaw === null ? null : folderIdRaw === "" ? null : folderIdRaw === "unassigned" ? null : Number(folderIdRaw),
        mime: sp.get("mime") || undefined,
        keyword: sp.get("keyword") || undefined,
        page: Number(sp.get("page")) || 1,
        pageSize: Number(sp.get("pageSize")) || 24,
      })),
    });
  }
  // V4.6.5:透传 folderId/keyword(此前被忽略 → 分组切换与搜索无效),并附真实计数
  const folderIdRaw = sp.get("folderId");
  const [folders, counts, list] = await Promise.all([
    listFolders(),
    getFolderCounts(),
    listMedia({
      page: Number(sp.get("page")) || 1,
      pageSize: Number(sp.get("pageSize")) || 24,
      mime: sp.get("mime") || undefined,
      folderId: folderIdRaw === "unassigned" ? null : folderIdRaw === null || folderIdRaw === "" ? undefined : Number(folderIdRaw),
      keyword: sp.get("keyword") || undefined,
    }),
  ]);
  return jsonOk({ folders, counts, ...list });
}

export async function POST(req: Request) {
  const guard = await requirePerm("content");
  const admin = "admin" in guard ? guard.admin : null;
  void logAdmin({ adminId: admin?.id ?? null, adminName: admin?.name ?? "?", action: "media.post", ip: getClientIp(req) });
  if ("error" in guard) return guard.error;
  // V4.2 文件夹动作分发(以 body 含 action 区分)
  const bodyUnknown: unknown = await req.clone().json().catch(() => null);
  if (bodyUnknown && typeof bodyUnknown === "object" && "action" in bodyUnknown) {
    const fa = folderActionSchema.safeParse(bodyUnknown);
    if (!fa.success) return jsonErr("参数错误");
    try {
      if (fa.data.action === "createFolder") await createFolder(fa.data.name, fa.data.parentId ?? null);
      if (fa.data.action === "renameFolder") await renameFolder(fa.data.id, fa.data.name);
      if (fa.data.action === "deleteFolder") await deleteFolder(fa.data.id);
      if (fa.data.action === "moveAssets") await moveAssets(fa.data.ids, fa.data.folderId);
      void logAdmin({ adminId: admin?.id ?? null, adminName: admin?.name ?? "?", action: `media.${fa.data.action}`, target: fa.data.action === "moveAssets" ? undefined : `folder:${"id" in fa.data ? fa.data.id : ""}`, ip: getClientIp(req) });
      return jsonOk();
    } catch (e) {
      return jsonErr(e instanceof Error ? e.message : "操作失败");
    }
  }
  const parsed = await parseBody(req, postSchema);
  if (parsed.error) return parsed.error;
  await updateMediaAlt(parsed.data.id, parsed.data.alt);
  return jsonOk();
}

export async function DELETE(req: Request) {
  const guard = await requirePerm("content");
  const admin = "admin" in guard ? guard.admin : null;
  void logAdmin({ adminId: admin?.id ?? null, adminName: admin?.name ?? "?", action: "media.delete", ip: getClientIp(req) });
  if ("error" in guard) return guard.error;
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return jsonErr("缺少 id");
  await deleteMedia(id);
  return jsonOk();
}
