import { requireAdmin } from "@/lib/auth/session";
import { jsonOk, jsonErr, contentLengthExceeds } from "@/lib/api";
import { VIDEO_MAX_SIZE_MB } from "@/lib/config";
import { createMedia } from "@/server/media";

/**
 * 后台文件上传:POST /api/admin/upload(multipart/form-data,字段 file、可选 alt)
 * 校验管理员会话;类型/大小限制由 Setting.upload 控制(视频单独放宽,上限见 VIDEO_MAX_SIZE_MB)。
 */
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;

  // 读取 body 前的体积预检:超最大上限直接拒,避免大文件整体进内存
  if (contentLengthExceeds(req, VIDEO_MAX_SIZE_MB)) {
    return jsonErr(`文件超过大小限制(最大 ${VIDEO_MAX_SIZE_MB}MB)`, 413);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonErr("请使用 multipart/form-data 上传");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return jsonErr("缺少文件字段 file");

  const alt = typeof form.get("alt") === "string" ? String(form.get("alt")) : undefined;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const asset = await createMedia(
      { buffer, originalName: file.name, mime: file.type },
      { uploaderType: "admin", uploaderId: guard.admin.id, alt }
    );
    return jsonOk(asset);
  } catch (e) {
    return jsonErr(e instanceof Error ? e.message : "上传失败");
  }
}
