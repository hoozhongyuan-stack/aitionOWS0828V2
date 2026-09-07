import { z } from "zod";
import { logAdmin } from "@/server/admin";
import { jsonOk, jsonErr, parseBody, getClientIp } from "@/lib/api";
import { requirePerm } from "@/lib/auth/session";
import { listCommentsAdmin, reviewComment, deleteComment } from "@/server/ugc";

/** 评论审核:GET ?status=&page= / POST {id,status}(通过/驳回)/ DELETE ?id= */

const postSchema = z.object({
  id: z.number().int(),
  status: z.enum(["APPROVED", "REJECTED"]),
});

export async function GET(req: Request) {
  const guard = await requirePerm("moderation");
  if ("error" in guard) return guard.error;
  const sp = new URL(req.url).searchParams;
  return jsonOk(
    await listCommentsAdmin(
      sp.get("status") || undefined,
      Number(sp.get("page")) || 1,
      Number(sp.get("pageSize")) || 10,
      sp.get("dateFrom") || undefined,
      sp.get("dateTo") || undefined
    )
  );
}

export async function POST(req: Request) {
  const guard = await requirePerm("moderation");
  const admin = "admin" in guard ? guard.admin : null;
  void logAdmin({ adminId: admin?.id ?? null, adminName: admin?.name ?? "?", action: "ugc.comments.post", ip: getClientIp(req) });
  if ("error" in guard) return guard.error;
  const parsed = await parseBody(req, postSchema);
  if (parsed.error) return parsed.error;
  try {
    await reviewComment(parsed.data.id, parsed.data.status);
    return jsonOk();
  } catch (e) {
    return jsonErr(e instanceof Error ? e.message : "操作失败");
  }
}

export async function DELETE(req: Request) {
  const guard = await requirePerm("moderation");
  const admin = "admin" in guard ? guard.admin : null;
  void logAdmin({ adminId: admin?.id ?? null, adminName: admin?.name ?? "?", action: "ugc.comments.delete", ip: getClientIp(req) });
  if ("error" in guard) return guard.error;
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return jsonErr("缺少 id");
  await deleteComment(id);
  return jsonOk();
}
