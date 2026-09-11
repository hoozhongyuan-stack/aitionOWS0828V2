import { z } from "zod";
import { jsonOk, jsonErr, parseBody, getClientIp } from "@/lib/api";
import { requirePerm } from "@/lib/auth/session";
import { logAdmin } from "@/server/admin";
import { updateContentSchedule } from "@/server/content";

/**
 * 列表页「定制发布」(V4.3.0):PATCH /api/admin/contents/schedule
 * - **只改 status 与 publishAt 两个字段**：列表页拿不到完整字段，
 *   走 PUT /api/admin/contents 会清空正文/翻译(整体覆盖语义,V4.1.2 事故同类风险),故单开此入口
 * - 权限沿用 content 权限组;操作写审计日志;定时时间必须晚于当前(服务层校验)
 */
const schema = z.object({
  id: z.number().int().positive(),
  action: z.enum(["publish", "schedule", "draft", "offline"]),
  publishAt: z.string().nullable().optional(),
});

export async function PATCH(req: Request) {
  const guard = await requirePerm("content");
  if ("error" in guard) return guard.error;

  const parsed = await parseBody(req, schema);
  if (parsed.error) return parsed.error;
  const { id, action, publishAt } = parsed.data;

  void logAdmin({
    adminId: guard.admin.id,
    adminName: guard.admin.name,
    action: `content.schedule.${action}`,
    target: `content:${id}`,
    detail: publishAt ? `publishAt=${publishAt}` : null,
    ip: getClientIp(req),
  });

  try {
    const result = await updateContentSchedule({ id, action, publishAt });
    return jsonOk(result);
  } catch (e) {
    return jsonErr(e instanceof Error ? e.message : "设置发布状态失败");
  }
}
