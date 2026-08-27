import { requireAdmin } from "@/lib/auth/session";
import { jsonOk, jsonErr } from "@/lib/api";
import { createMedia } from "@/server/media";

/**
 * 后台文件上传:POST /api/admin/upload(multipart/form-data,字段 file、可选 alt)
 * 校验管理员会话;类型/大小限制由 Setting.upload 控制。
 */
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;

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
