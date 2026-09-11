import { z } from "zod";
import { jsonOk, jsonErr, parseBody, getClientIp } from "@/lib/api";
import { requirePerm } from "@/lib/auth/session";
import { logAdmin } from "@/server/admin";
import { runBatch, normalizeBatchIds, describeOutcome } from "@/server/batch";
import { setCategoryVisible, deleteCategory } from "@/server/content";

/**
 * 栏目批量操作(V4.4.0):POST /api/admin/categories/batch
 * 删除会**逐项**走 deleteCategory 的既有规则(含子栏目/含内容时抛错 → 计入 skipped 并回报原因),
 * 不做级联删除 —— 这是有意为之:批量删除栏目最危险的正是"连带清空内容"。
 */
const schema = z.object({
  ids: z.array(z.number().int()).min(1),
  action: z.enum(["show", "hide", "delete"]),
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
      await deleteCategory(id);
      return;
    }
    await setCategoryVisible(id, action === "show");
  });

  void logAdmin({
    adminId: admin?.id ?? null,
    adminName: admin?.name ?? "?",
    action: `category.batch.${action}`,
    target: `ids:${norm.ids.slice(0, 10).join(",")}${norm.ids.length > 10 ? `…(+${norm.ids.length - 10})` : ""}`,
    detail: `ok=${outcome.ok.length} skipped=${outcome.skipped.length}`,
    ip: getClientIp(req),
  });

  // 摘要随响应返回:前端 toast 与 MCP 工具回执无需各自重算
  return jsonOk({ ...outcome, summary: describeOutcome(outcome) });
}
