import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonOk, jsonErr, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { saveSettingGroup } from "@/server/setting";

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

  const admin = await prisma.adminUser.findUnique({ where: { id: guard.admin.id } });
  if (!admin) return jsonErr("账号不存在", 404);
  if (!(await verifyPassword(oldPassword, admin.passwordHash))) {
    return jsonErr("原密码错误", 400);
  }
  if (newPassword === "admin888") return jsonErr("新密码不能使用默认密码");

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  await saveSettingGroup("security", { defaultPwChanged: true });

  return jsonOk();
}
