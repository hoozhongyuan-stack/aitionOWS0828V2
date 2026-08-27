import { getUserSession, getActiveUserSession } from "@/lib/auth/session";
import { jsonOk, jsonErr, getClientIp } from "@/lib/api";
import { createMedia } from "@/server/media";
import { rateLimit } from "@/lib/ugc/anti-spam";

/**
 * 前台文件上传:POST /api/upload(multipart/form-data,字段 file、purpose)
 * - purpose=submission:用户投稿配图,必须登录(且账号未被禁用)
 * - purpose=form:表单附件,允许游客
 * 防刷:匿名/登录双轨滑动窗口限频——上传直接消耗磁盘与数据库,不设限可被匿名刷爆。
 */

const PURPOSES = new Set(["form", "submission"]);
/** 窗口 10 分钟;游客远严于登录用户(攻击成本不对称) */
const WINDOW_MS = 600_000;

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonErr("请使用 multipart/form-data 上传");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return jsonErr("缺少文件字段 file");

  const rawPurpose = String(form.get("purpose") || "form");
  const purpose = PURPOSES.has(rawPurpose) ? rawPurpose : "form"; // 白名单外一律按 form 处理

  // 登录态需为有效账号:被封禁用户的会话在此失效,不得继续产出文件
  const user = purpose === "submission" ? await getActiveUserSession() : await getUserSession();
  if (purpose === "submission" && !user) return jsonErr("请先登录", 401);

  const bucket = user ? `upload:u${user.id}` : `upload:${getClientIp(req)}`;
  if (!rateLimit(bucket, user ? 60 : 12, WINDOW_MS)) {
    return jsonErr("上传过于频繁,请稍后再试", 429);
  }

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
