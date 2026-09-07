import { z } from "zod";
import { logAdmin } from "@/server/admin";
import { jsonOk, jsonErr, parseBody, getClientIp } from "@/lib/api";
import { requireOwner } from "@/lib/auth/session";
import { adminUpdateProfile, listUsersAdmin, setUserStatus, userProfileSchema } from "@/server/user";

/**
 * 后台用户管理(需求 4.6 / V3.0 REQ-009):
 * GET  列表(keyword 邮箱/昵称搜索 + q 公司名称搜索 + 分页;列表项含 4 个资料字段供编辑回显)
 * POST 启用/禁用
 * PATCH 更新用户资料(公司名称/国家/省/市,全部可留空)
 */

const postSchema = z.object({
  id: z.number().int(),
  status: z.enum(["ACTIVE", "DISABLED"]),
});

const patchSchema = z.object({ id: z.number().int() }).extend(userProfileSchema.shape);

export async function GET(req: Request) {
  const guard = await requireOwner();
  if ("error" in guard) return guard.error;
  const sp = new URL(req.url).searchParams;
  return jsonOk(
    await listUsersAdmin({
      page: Number(sp.get("page")) || 1,
      pageSize: Number(sp.get("pageSize")) || 10,
      keyword: sp.get("keyword") || undefined,
      q: sp.get("q") || undefined,
    })
  );
}

export async function POST(req: Request) {
  const guard = await requireOwner();
  const admin = "admin" in guard ? guard.admin : null;
  void logAdmin({ adminId: admin?.id ?? null, adminName: admin?.name ?? "?", action: "users.post", ip: getClientIp(req) });
  if ("error" in guard) return guard.error;
  const parsed = await parseBody(req, postSchema);
  if (parsed.error) return parsed.error;
  try {
    await setUserStatus(parsed.data.id, parsed.data.status);
    return jsonOk();
  } catch (e) {
    return jsonErr(e instanceof Error ? e.message : "操作失败");
  }
}

/** 资料更新(REQ-009):4 字段全可选;服务层二次 zod 校验(trim/≤100) */
export async function PATCH(req: Request) {
  const guard = await requireOwner();
  const admin = "admin" in guard ? guard.admin : null;
  void logAdmin({ adminId: admin?.id ?? null, adminName: admin?.name ?? "?", action: "users.patch", ip: getClientIp(req) });
  if ("error" in guard) return guard.error;
  const parsed = await parseBody(req, patchSchema);
  if (parsed.error) return parsed.error;
  try {
    const { id, ...profile } = parsed.data;
    return jsonOk(await adminUpdateProfile(id, profile));
  } catch (e) {
    return jsonErr(e instanceof Error ? e.message : "操作失败");
  }
}
