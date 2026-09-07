import { z } from "zod";
import { logAdmin } from "@/server/admin";
import { jsonOk, jsonErr, parseBody, getClientIp } from "@/lib/api";
import { requirePerm } from "@/lib/auth/session";
import { listSubmissionsAdmin, reviewSubmission } from "@/server/ugc";

/** 投稿审核:GET ?status=&page= / POST {id, approve}(通过即发布/驳回) */

const postSchema = z.object({
  id: z.number().int(),
  approve: z.boolean(),
});

export async function GET(req: Request) {
  const guard = await requirePerm("moderation");
  if ("error" in guard) return guard.error;
  const sp = new URL(req.url).searchParams;
  return jsonOk(
    await listSubmissionsAdmin(
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
  void logAdmin({ adminId: admin?.id ?? null, adminName: admin?.name ?? "?", action: "ugc.submissions.post", ip: getClientIp(req) });
  if ("error" in guard) return guard.error;
  const parsed = await parseBody(req, postSchema);
  if (parsed.error) return parsed.error;
  try {
    await reviewSubmission(parsed.data.id, parsed.data.approve);
    return jsonOk();
  } catch (e) {
    return jsonErr(e instanceof Error ? e.message : "操作失败");
  }
}
