import { z } from "zod";
import { jsonOk, jsonErr, parseBody, getClientIp } from "@/lib/api";
import { requireOwner } from "@/lib/auth/session";
import { logAdmin } from "@/server/admin";
import { runBatch, normalizeBatchIds, describeOutcome } from "@/server/batch";
import { setUserStatus } from "@/server/user";
import { USER_STATUS } from "@/types/domain";

/**
 * 注册用户批量操作(V4.4.0):POST /api/admin/users/batch
 * **只开放启用/禁用,不开放批量删除** —— 用户连带订单/评论/收藏/投稿等数据,
 * 误删影响面大,删除保持单个操作 + 二次确认。这也是本模块安全设计的有意取舍。
 */
const schema = z.object({
  ids: z.array(z.number().int()).min(1),
  action: z.enum(["enable", "disable"]),
});

export async function POST(req: Request) {
  const guard = await requireOwner();
  const admin = "admin" in guard ? guard.admin : null;
  if ("error" in guard) return guard.error;

  const parsed = await parseBody(req, schema);
  if (parsed.error) return parsed.error;
  const norm = normalizeBatchIds(parsed.data.ids);
  if ("error" in norm) return jsonErr(norm.error);

  const { action } = parsed.data;
  const outcome = await runBatch(norm.ids, (id) =>
    setUserStatus(id, action === "enable" ? USER_STATUS.ACTIVE : USER_STATUS.DISABLED)
  );

  void logAdmin({
    adminId: admin?.id ?? null,
    adminName: admin?.name ?? "?",
    action: `user.batch.${action}`,
    target: `ids:${norm.ids.slice(0, 10).join(",")}${norm.ids.length > 10 ? `…(+${norm.ids.length - 10})` : ""}`,
    detail: `ok=${outcome.ok.length} skipped=${outcome.skipped.length}`,
    ip: getClientIp(req),
  });

  // 摘要随响应返回:前端 toast 与 MCP 工具回执无需各自重算
  return jsonOk({ ...outcome, summary: describeOutcome(outcome) });
}
