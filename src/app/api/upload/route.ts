import { getUserSession } from "@/lib/auth/session";
import { jsonOk, jsonErr } from "@/lib/api";
import { createMedia } from "@/server/media";

/**
 * 前台文件上传:POST /api/upload(multipart/form-data,字段 file、purpose)
 * - purpose=submission:用户投稿配图,必须登录
 * - purpose=form:表单附件,允许游客(受同样的类型/大小限制)
 */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonErr("请使用 multipart/form-data 上传");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return jsonErr("缺少文件字段 file");
  const purpose = String(form.get("purpose") || "form");

  const user = await getUserSession();
  if (purpose === "submission" && !user) return jsonErr("请先登录", 401);

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const asset = await createMedia(
      { buffer, originalName: file.name, mime: file.type },
      { uploaderType: user ? "user" : "form", uploaderId: user?.id ?? null }
    );
    // 前台仅回传必要字段
    return jsonOk({ id: asset.id, url: asset.url, filename: asset.filename, mime: asset.mime });
  } catch (e) {
    return jsonErr(e instanceof Error ? e.message : "上传失败");
  }
}
