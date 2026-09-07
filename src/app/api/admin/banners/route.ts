import { z } from "zod";
import { logAdmin } from "@/server/admin";
import { jsonOk, jsonErr, parseBody, getClientIp } from "@/lib/api";
import { requirePerm } from "@/lib/auth/session";
import { listBanners, saveBanners, MAX_BANNERS } from "@/server/banner";

/** 轮播图管理:GET(列表)/ PUT(整组覆盖保存,最多 MAX_BANNERS 张) */

const putSchema = z.object({
  items: z
    .array(
      z.object({
        imageUrl: z.string().min(1, "请上传图片"),
        linkUrl: z.string().nullable(),
        enabled: z.boolean(),
      })
    )
    .max(MAX_BANNERS, `轮播图最多支持 ${MAX_BANNERS} 张`),
});

export async function GET() {
  const guard = await requirePerm("content");
  if ("error" in guard) return guard.error;
  return jsonOk(await listBanners());
}

export async function PUT(req: Request) {
  const guard = await requirePerm("content");
  const admin = "admin" in guard ? guard.admin : null;
  void logAdmin({ adminId: admin?.id ?? null, adminName: admin?.name ?? "?", action: "banners.put", ip: getClientIp(req) });
  if ("error" in guard) return guard.error;
  const parsed = await parseBody(req, putSchema);
  if (parsed.error) return parsed.error;
  try {
    await saveBanners(parsed.data.items);
    return jsonOk();
  } catch (e) {
    return jsonErr(e instanceof Error ? e.message : "保存失败");
  }
}
