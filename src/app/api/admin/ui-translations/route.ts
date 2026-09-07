import { z } from "zod";
import { logAdmin } from "@/server/admin";
import { jsonOk, jsonErr, parseBody, getClientIp } from "@/lib/api";
import { requireOwner } from "@/lib/auth/session";
import { listUiTranslations, saveUiTranslations, deleteUiTranslation } from "@/server/i18n";

/**
 * 界面文案 DB 覆盖:
 * GET  /api/admin/ui-translations?locale=zh-CN
 * PUT  /api/admin/ui-translations   { rows: [{locale,namespace,key,value}] }
 * DELETE /api/admin/ui-translations?id=1(恢复文件默认)
 */

const putSchema = z.object({
  rows: z.array(
    z.object({
      locale: z.string().min(2),
      namespace: z.string().min(1),
      key: z.string().min(1),
      value: z.string(),
    })
  ),
});

export async function GET(req: Request) {
  const guard = await requireOwner();
  if ("error" in guard) return guard.error;
  const locale = new URL(req.url).searchParams.get("locale") || "zh-CN";
  return jsonOk(await listUiTranslations(locale));
}

export async function PUT(req: Request) {
  const guard = await requireOwner();
  const admin = "admin" in guard ? guard.admin : null;
  void logAdmin({ adminId: admin?.id ?? null, adminName: admin?.name ?? "?", action: "ui-translations.put", ip: getClientIp(req) });
  if ("error" in guard) return guard.error;
  const parsed = await parseBody(req, putSchema);
  if (parsed.error) return parsed.error;
  await saveUiTranslations(parsed.data.rows);
  return jsonOk();
}

export async function DELETE(req: Request) {
  const guard = await requireOwner();
  const admin = "admin" in guard ? guard.admin : null;
  void logAdmin({ adminId: admin?.id ?? null, adminName: admin?.name ?? "?", action: "ui-translations.delete", ip: getClientIp(req) });
  if ("error" in guard) return guard.error;
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return jsonErr("缺少 id");
  await deleteUiTranslation(id);
  return jsonOk();
}
