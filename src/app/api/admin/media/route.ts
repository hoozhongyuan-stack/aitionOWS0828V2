import { z } from "zod";
import { logAdmin } from "@/server/admin";
import { jsonOk, jsonErr, parseBody, getClientIp } from "@/lib/api";
import { requirePerm } from "@/lib/auth/session";
import { listMedia, updateMediaAlt, deleteMedia } from "@/server/media";

/** 文件管理:GET ?page=&mime= 列表 / POST {id,alt} 改 alt / DELETE ?id= */

const postSchema = z.object({ id: z.number().int(), alt: z.string().max(200) });

export async function GET(req: Request) {
  const guard = await requirePerm("content");
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
  const guard = await requirePerm("content");
  const admin = "admin" in guard ? guard.admin : null;
  void logAdmin({ adminId: admin?.id ?? null, adminName: admin?.name ?? "?", action: "media.post", ip: getClientIp(req) });
  if ("error" in guard) return guard.error;
  const parsed = await parseBody(req, postSchema);
  if (parsed.error) return parsed.error;
  await updateMediaAlt(parsed.data.id, parsed.data.alt);
  return jsonOk();
}

export async function DELETE(req: Request) {
  const guard = await requirePerm("content");
  const admin = "admin" in guard ? guard.admin : null;
  void logAdmin({ adminId: admin?.id ?? null, adminName: admin?.name ?? "?", action: "media.delete", ip: getClientIp(req) });
  if ("error" in guard) return guard.error;
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return jsonErr("缺少 id");
  await deleteMedia(id);
  return jsonOk();
}
