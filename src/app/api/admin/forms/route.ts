import { z } from "zod";
import { jsonOk, jsonErr, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { listForms, getForm, saveForm, deleteForm } from "@/server/form";
import { formFieldsSchema } from "@/types/form";

/** 表单定义管理:GET(列表 / ?id= 单条)/ PUT / DELETE ?id= */

const putSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().min(1, "请输入表单名称"),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "标识仅允许小写字母数字与连字符"),
  fields: formFieldsSchema,
  relatedKey: z.string().nullable(),
  antiDuplicate: z.boolean(),
  enabled: z.boolean(),
});

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const form = await getForm(Number(id));
    if (!form) return jsonErr("表单不存在", 404);
    return jsonOk(form);
  }
  return jsonOk(await listForms());
}

export async function PUT(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const parsed = await parseBody(req, putSchema);
  if (parsed.error) return parsed.error;
  try {
    return jsonOk(await saveForm(parsed.data));
  } catch (e) {
    return jsonErr(e instanceof Error ? e.message : "保存失败");
  }
}

export async function DELETE(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return jsonErr("缺少 id");
  await deleteForm(id);
  return jsonOk();
}
