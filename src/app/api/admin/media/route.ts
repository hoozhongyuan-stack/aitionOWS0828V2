import { z } from "zod";
import { jsonOk, jsonErr, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { listMedia, updateMediaAlt, deleteMedia } from "@/server/media";

/** 文件管理:GET ?page=&mime= 列表 / POST {id,alt} 改 alt / DELETE ?id= */

const postSchema = z.object({ id: z.number().int(), alt: z.string().max(200) });

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const sp = new URL(req.url).searchParams;
  return jsonOk(
    await listMedia({
      page: Number(sp.get("page")) || 1,
      mime: sp.get("mime") || undefined,
    })
  );
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const parsed = await parseBody(req, postSchema);
  if (parsed.error) return parsed.error;
  await updateMediaAlt(parsed.data.id, parsed.data.alt);
  return jsonOk();
}

export async function DELETE(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return jsonErr("缺少 id");
  await deleteMedia(id);
  return jsonOk();
}
