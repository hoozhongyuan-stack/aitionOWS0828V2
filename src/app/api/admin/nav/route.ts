import { z } from "zod";
import { logAdmin } from "@/server/admin";
import { jsonOk, jsonErr, parseBody, getClientIp } from "@/lib/api";
import { requirePerm } from "@/lib/auth/session";
import { listNavItems, saveNavItem, deleteNavItem } from "@/server/content";

/** 导航管理:GET / PUT / DELETE ?id= */

const putSchema = z.object({
  id: z.number().int().optional(),
  parentId: z.number().int().nullable(),
  categoryId: z.number().int().nullable(),
  label: z.string(),
  labelI18n: z.string().nullable(),
  url: z.string().nullable(),
  sort: z.number().int(),
  visible: z.boolean(),
  target: z.string(),
});

export async function GET() {
  const guard = await requirePerm("content");
  if ("error" in guard) return guard.error;
  return jsonOk(await listNavItems());
}

export async function PUT(req: Request) {
  const guard = await requirePerm("content");
  const admin = "admin" in guard ? guard.admin : null;
  void logAdmin({ adminId: admin?.id ?? null, adminName: admin?.name ?? "?", action: "nav.put", ip: getClientIp(req) });
  if ("error" in guard) return guard.error;
  const parsed = await parseBody(req, putSchema);
  if (parsed.error) return parsed.error;
  if (!parsed.data.categoryId && !parsed.data.url) return jsonErr("请关联栏目或填写自定义链接");
  const item = await saveNavItem(parsed.data);
  return jsonOk(item);
}

export async function DELETE(req: Request) {
  const guard = await requirePerm("content");
  const admin = "admin" in guard ? guard.admin : null;
  void logAdmin({ adminId: admin?.id ?? null, adminName: admin?.name ?? "?", action: "nav.delete", ip: getClientIp(req) });
  if ("error" in guard) return guard.error;
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return jsonErr("缺少 id");
  await deleteNavItem(id);
  return jsonOk();
}
