import { z } from "zod";
import { jsonOk, jsonErr, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { listCategories, saveCategory, deleteCategory } from "@/server/content";

/** 栏目管理:GET(列表)/ PUT(新建或更新)/ DELETE ?id= */

const putSchema = z.object({
  id: z.number().int().optional(),
  slug: z
    .string()
    .min(1, "请输入栏目标识")
    .regex(/^[a-z0-9-]+$/, "标识仅允许小写字母、数字与连字符"),
  parentId: z.number().int().nullable(),
  moduleType: z.string().min(1),
  sort: z.number().int(),
  visible: z.boolean(),
  externalUrl: z.string().nullable(),
  allowSubmit: z.boolean(),
  translations: z.array(
    z.object({
      locale: z.string(),
      name: z.string(),
      description: z.string().nullable().optional(),
    })
  ),
});

export async function GET() {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  return jsonOk(await listCategories());
}

export async function PUT(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const parsed = await parseBody(req, putSchema);
  if (parsed.error) return parsed.error;
  try {
    const cat = await saveCategory(parsed.data);
    return jsonOk(cat);
  } catch (e) {
    return jsonErr(e instanceof Error ? e.message : "保存失败");
  }
}

export async function DELETE(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return jsonErr("缺少 id");
  try {
    await deleteCategory(id);
    return jsonOk();
  } catch (e) {
    return jsonErr(e instanceof Error ? e.message : "删除失败");
  }
}
