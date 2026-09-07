import { z } from "zod";
import { jsonOk, jsonErr, parseBody, getClientIp } from "@/lib/api";
import { logAdmin } from "@/server/admin";
import { requireAdmin } from "@/lib/auth/session";
import { saveSettingGroup } from "@/server/setting";
import { changeAdminPassword } from "@/server/admin";

/**
 * 管理员修改密码:POST /api/admin/auth/password
 * 成功后标记 security.defaultPwChanged=true(解除首登强制改密)。
 */
const schema = z.object({
  oldPassword: z.string().min(1, "请输入原密码"),
  newPassword: z.string().min(8, "新密码至少 8 位"),
});

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;

  const parsed = await parseBody(req, schema);
  if (parsed.error) return parsed.error;
  const { oldPassword, newPassword } = parsed.data;

  try {
    await changeAdminPassword(guard.admin.id, oldPassword, newPassword);
  } catch (e) {
    return jsonErr(e instanceof Error ? e.message : "修改失败");
  }

  await saveSettingGroup("security", { defaultPwChanged: true });
  void logAdmin({ adminId: guard.admin.id, adminName: guard.admin.name, action: "auth.password_changed", ip: getClientIp(req) });

  return jsonOk();
}
