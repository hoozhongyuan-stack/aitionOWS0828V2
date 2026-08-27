import { z } from "zod";
import { jsonOk, jsonErr, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { listSeoMeta, saveSeoMeta, deleteSeoMeta } from "@/server/seo";

/** 固定页 TDK:GET / PUT / DELETE ?id=(内容/栏目 TDK 在各自编辑处) */

const putSchema = z.object({
  pageKey: z.string().min(1).regex(/^[a-z0-9-]+$/, "页面标识仅允许小写字母数字与连字符"),
  locale: z.string().min(2),
  title: z.string(),
  keywords: z.string(),
  description: z.string(),
});

export async function GET() {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  return jsonOk(await listSeoMeta());
}

export async function PUT(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const parsed = await parseBody(req, putSchema);
  if (parsed.error) return parsed.error;
  await saveSeoMeta(parsed.data);
  return jsonOk();
}

export async function DELETE(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return jsonErr("缺少 id");
  await deleteSeoMeta(id);
  return jsonOk();
}
