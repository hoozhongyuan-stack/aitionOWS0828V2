import { z } from "zod";
import { jsonOk, jsonErr, parseBody, getClientIp } from "@/lib/api";
import { requirePerm } from "@/lib/auth/session";
import { logAdmin } from "@/server/admin";
import { runBatch, normalizeBatchIds, describeOutcome } from "@/server/batch";
import { updateContentSchedule, deleteContent, setContentPin } from "@/server/content";

/**
 * 内容批量操作(V4.4.0):POST /api/admin/contents/batch
 * - 逐项执行并汇报(见 server/batch 的设计说明);服务层复用单条逻辑,行为与单个操作一致
 * - 权限沿用 content 组;一次批量写一条审计日志
 */
const schema = z.object({
  ids: z.array(z.number().int()).min(1),
  // pin/unpin(V4.8.1):置顶/取消置顶;可带 expiresAt 指定到期时刻(留空=永久)
  action: z.enum(["publish", "offline", "draft", "delete", "pin", "unpin"]),
  expiresAt: z.string().datetime().nullable().optional(),
});

export async function POST(req: Request) {
  const guard = await requirePerm("content");
  const admin = "admin" in guard ? guard.admin : null;
  if ("error" in guard) return guard.error;

  const parsed = await parseBody(req, schema);
  if (parsed.error) return parsed.error;
  const norm = normalizeBatchIds(parsed.data.ids);
  if ("error" in norm) return jsonErr(norm.error);

  const { action } = parsed.data;
  const outcome = await runBatch(norm.ids, async (id) => {
    if (action === "delete") {
      await deleteContent(id);
      return;
    }
    if (action === "pin" || action === "unpin") {
      await setContentPin({
        id,
        pinned: action === "pin",
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      });
      return;
    }
    // publish / offline / draft 复用 V4.3.0 的轻量状态变更(不整体覆盖)
    await updateContentSchedule({ id, action });
  });

  void logAdmin({
    adminId: admin?.id ?? null,
    adminName: admin?.name ?? "?",
    action: `content.batch.${action}`,
    target: `ids:${norm.ids.slice(0, 10).join(",")}${norm.ids.length > 10 ? `…(+${norm.ids.length - 10})` : ""}`,
    detail: `ok=${outcome.ok.length} skipped=${outcome.skipped.length}`,
    ip: getClientIp(req),
  });

  // 摘要随响应返回:前端 toast 与 MCP 工具回执无需各自重算
  return jsonOk({ ...outcome, summary: describeOutcome(outcome) });
}
