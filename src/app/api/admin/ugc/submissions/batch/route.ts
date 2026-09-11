import { z } from "zod";
import { jsonOk, jsonErr, parseBody, getClientIp } from "@/lib/api";
import { requirePerm } from "@/lib/auth/session";
import { logAdmin } from "@/server/admin";
import { runBatch, normalizeBatchIds, describeOutcome } from "@/server/batch";
import { reviewSubmission } from "@/server/ugc";

/**
 * 投稿批量审核(V4.4.0):POST /api/admin/ugc/submissions/batch
 * **只开放通过/驳回,不提供删除** —— 投稿本质是内容(Content, source=UGC),
 * 删除属内容管理职责,走 /api/admin/contents 的单个删除(先审后发链路的既有设计)。
 */
const schema = z.object({
  ids: z.array(z.number().int()).min(1),
  action: z.enum(["approve", "reject"]),
});

export async function POST(req: Request) {
  const guard = await requirePerm("moderation");
  const admin = "admin" in guard ? guard.admin : null;
  if ("error" in guard) return guard.error;

  const parsed = await parseBody(req, schema);
  if (parsed.error) return parsed.error;
  const norm = normalizeBatchIds(parsed.data.ids);
  if ("error" in norm) return jsonErr(norm.error);

  const { action } = parsed.data;
  const outcome = await runBatch(norm.ids, (id) => reviewSubmission(id, action === "approve"));

  void logAdmin({
    adminId: admin?.id ?? null,
    adminName: admin?.name ?? "?",
    action: `submission.batch.${action}`,
    target: `ids:${norm.ids.slice(0, 10).join(",")}${norm.ids.length > 10 ? `…(+${norm.ids.length - 10})` : ""}`,
    detail: `ok=${outcome.ok.length} skipped=${outcome.skipped.length}`,
    ip: getClientIp(req),
  });

  // 摘要随响应返回:前端 toast 与 MCP 工具回执无需各自重算
  return jsonOk({ ...outcome, summary: describeOutcome(outcome) });
}
