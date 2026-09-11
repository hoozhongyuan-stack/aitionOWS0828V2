import { z } from "zod";
import { jsonOk, jsonErr, parseBody, getClientIp } from "@/lib/api";
import { requirePerm } from "@/lib/auth/session";
import { logAdmin } from "@/server/admin";
import { runBatch, normalizeBatchIds, describeOutcome } from "@/server/batch";
import { reviewComment, deleteComment } from "@/server/ugc";
import { COMMENT_STATUS } from "@/types/domain";

/**
 * 评论批量审核(V4.4.0):POST /api/admin/ugc/comments/batch
 * 权限沿用 moderation 组;逐项执行并回报跳过原因。
 */
const schema = z.object({
  ids: z.array(z.number().int()).min(1),
  action: z.enum(["approve", "reject", "delete"]),
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
  const outcome = await runBatch(norm.ids, async (id) => {
    if (action === "delete") {
      await deleteComment(id);
      return;
    }
    await reviewComment(id, action === "approve" ? COMMENT_STATUS.APPROVED : COMMENT_STATUS.REJECTED);
  });

  void logAdmin({
    adminId: admin?.id ?? null,
    adminName: admin?.name ?? "?",
    action: `comment.batch.${action}`,
    target: `ids:${norm.ids.slice(0, 10).join(",")}${norm.ids.length > 10 ? `…(+${norm.ids.length - 10})` : ""}`,
    detail: `ok=${outcome.ok.length} skipped=${outcome.skipped.length}`,
    ip: getClientIp(req),
  });

  // 摘要随响应返回:前端 toast 与 MCP 工具回执无需各自重算
  return jsonOk({ ...outcome, summary: describeOutcome(outcome) });
}
