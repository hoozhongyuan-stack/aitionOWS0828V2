import { z } from "zod";
import { jsonErr, jsonOk, parseBody, getClientIp } from "@/lib/api";
import { requireOwner } from "@/lib/auth/session";
import { createStaffUser, updateStaffUser, deleteStaffUser, listAdminUsers, logAdmin } from "@/server/admin";
import { VALID_PERMISSION_KEYS } from "@/server/admin/permissions";

/**
 * 子账号管理(V4.1,主账号专属):
 * - GET  列表(含权限组)
 * - POST 创建 {username,password,displayName?,permissions[]}
 * - PATCH 更新 {id,displayName?,permissions?,status?,newPassword?}
 * - DELETE ?id= 删除子账号
 * 全部写操作记操作日志。
 */

export async function GET(req: Request) {
  const guard = await requireOwner();
  if ("error" in guard) return guard.error;
  return jsonOk(await listAdminUsers());
}

const permSchema = z.array(z.enum(VALID_PERMISSION_KEYS as [string, ...string[]]));

const createSchema = z.object({
  username: z.string().min(2).max(32),
  password: z.string().min(8).max(64),
  displayName: z.string().max(40).optional(),
  permissions: permSchema,
});

export async function POST(req: Request) {
  const guard = await requireOwner();
  if ("error" in guard) return guard.error;
  const parsed = await parseBody(req, createSchema);
  if (parsed.error) return parsed.error;
  try {
    const r = await createStaffUser(parsed.data);
    void logAdmin({
      adminId: guard.admin.id,
      adminName: guard.admin.name,
      action: "admin-users.create",
      target: `admin-user:${r.id}`,
      detail: `创建子账号 ${parsed.data.username},权限: ${parsed.data.permissions.join(",") || "无"}`,
      ip: getClientIp(req),
    });
    return jsonOk(r);
  } catch (e) {
    return jsonErr(e instanceof Error ? e.message : "创建失败");
  }
}

const updateSchema = z.object({
  id: z.number().int().positive(),
  displayName: z.string().max(40).optional(),
  permissions: permSchema.optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  newPassword: z.string().min(8).max(64).optional(),
});

export async function PATCH(req: Request) {
  const guard = await requireOwner();
  if ("error" in guard) return guard.error;
  const parsed = await parseBody(req, updateSchema);
  if (parsed.error) return parsed.error;
  try {
    await updateStaffUser(parsed.data);
    void logAdmin({
      adminId: guard.admin.id,
      adminName: guard.admin.name,
      action: "admin-users.update",
      target: `admin-user:${parsed.data.id}`,
      detail: `更新子账号(${Object.keys(parsed.data).filter((k) => k !== "id").join("/")})`,
      ip: getClientIp(req),
    });
    return jsonOk();
  } catch (e) {
    return jsonErr(e instanceof Error ? e.message : "更新失败");
  }
}

export async function DELETE(req: Request) {
  const guard = await requireOwner();
  if ("error" in guard) return guard.error;
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return jsonErr("缺少 id");
  try {
    await deleteStaffUser(id);
    void logAdmin({
      adminId: guard.admin.id,
      adminName: guard.admin.name,
      action: "admin-users.delete",
      target: `admin-user:${id}`,
      ip: getClientIp(req),
    });
    return jsonOk();
  } catch (e) {
    return jsonErr(e instanceof Error ? e.message : "删除失败");
  }
}
