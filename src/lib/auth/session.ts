import { cookies } from "next/headers";
import { verifyToken, isInsecureSecret } from "./jwt";
import { prisma } from "@/lib/db";
import { USER_STATUS } from "@/types/domain";
import { jsonErr } from "@/lib/api";

/**
 * 会话读取(服务端组件 / Route Handler 通用)。
 * 管理员与前台用户使用独立 cookie,互不干扰。
 */

export const ADMIN_COOKIE = "aition_admin"; // 管理员会话
export const USER_COOKIE = "aition_user"; // 前台用户会话
export const GUEST_COOKIE = "aition_guest"; // 游客指纹(点赞防刷)

export interface AdminSession {
  id: number;
  name: string;
}
export interface UserSession {
  id: number;
  name: string;
}

/** 读取管理员会话;未登录返回 null */
export async function getAdminSession(): Promise<AdminSession | null> {
  const c = await cookies();
  const token = c.get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const p = await verifyToken(token);
  if (!p || p.typ !== "admin") return null;
  return { id: Number(p.sub), name: p.name };
}

/** 读取前台用户会话;未登录返回 null */
export async function getUserSession(): Promise<UserSession | null> {
  const c = await cookies();
  const token = c.get(USER_COOKIE)?.value;
  if (!token) return null;
  const p = await verifyToken(token);
  if (!p || p.typ !== "user") return null;
  return { id: Number(p.sub), name: p.name };
}

/** Route Handler 守卫:要求管理员登录,否则返回 401 响应 */
export async function requireAdmin(): Promise<{ admin: AdminSession } | { error: ReturnType<typeof jsonErr> }> {
  const admin = await getAdminSession();
  if (!admin) return { error: jsonErr("未登录或会话已过期", 401) };
  return { admin };
}

/** Route Handler 守卫:要求前台用户登录 */
export async function requireUser(): Promise<{ user: UserSession } | { error: ReturnType<typeof jsonErr> }> {
  const user = await getUserSession();
  if (!user) return { error: jsonErr("请先登录", 401) };
  return { user };
}

/**
 * 登录/注册等发令牌的接口必须先过这道闸:
 * 生产环境使用默认/未配置 AUTH_SECRET 时拒绝发放会话,并给出可操作的提示
 * (默认密钥是公开字符串,任何人都能伪造 admin JWT,绝不能静默放行)。
 * 返回 null 表示放行。
 */
export function guardAuthSecret(): ReturnType<typeof jsonErr> | null {
  if (process.env.NODE_ENV === "production" && isInsecureSecret()) {
    return jsonErr("服务端安全密钥(AUTH_SECRET)未配置,登录已禁用。请在部署环境设置强随机 AUTH_SECRET 后重启服务", 503);
  }
  return null;
}

/**
 * 写操作专用会话读取:除签名校验外还复查账号当前状态。
 * 被封禁用户在 cookie 有效期内也不得继续产出 UGC/上传(会话不吊销体系下的必要兜底)。
 */
export async function getActiveUserSession(): Promise<UserSession | null> {
  const s = await getUserSession();
  if (!s) return null;
  const u = await prisma.user.findUnique({ where: { id: s.id }, select: { status: true } });
  if (!u || u.status !== USER_STATUS.ACTIVE) return null;
  return s;
}

/** 同 getActiveUserSession 的守卫版本:未登录或已禁用均返回 401 */
export async function requireActiveUser(): Promise<{ user: UserSession } | { error: ReturnType<typeof jsonErr> }> {
  const user = await getActiveUserSession();
  if (!user) return { error: jsonErr("请先登录", 401) };
  return { user };
}

/** 会话 cookie 通用属性 */
export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https"),
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

// ============================================================
// V4.1 权限守卫:主账号(OWNER)/子账号(STAFF 预定义权限组)
// 每次查库校验角色与状态——禁用子账号立即失效,不依赖 token 余期。
// ============================================================
import { getAdminWithRole, parsePermissions } from "@/server/admin";
import type { PermissionKey } from "@/server/admin/permissions";

export interface GuardedAdmin {
  id: number;
  name: string;
  role: string;
  permissions: PermissionKey[];
}

/** 查库取当前管理员(含角色/权限);未登录/不存在/DISABLED → null */
export async function getGuardedAdmin(): Promise<GuardedAdmin | null> {
  const session = await getAdminSession();
  if (!session) return null;
  const row = await getAdminWithRole(session.id);
  if (!row || row.status !== "ACTIVE") return null;
  return {
    id: row.id,
    name: row.displayName || row.username,
    role: row.role,
    permissions: parsePermissions(row.permissions),
  };
}

function denied(message = "无权限执行此操作") {
  return { error: jsonErr(message, 403) };
}

/** 主账号专属守卫:站点配置/用户/子账号/日志/备份/数据看板等 */
export async function requireOwner(): Promise<{ admin: GuardedAdmin } | { error: ReturnType<typeof jsonErr> }> {
  const admin = await getGuardedAdmin();
  if (!admin) return { error: jsonErr("未登录或会话已过期", 401) };
  if (admin.role !== "OWNER") return denied();
  return { admin };
}

/** 预定义权限组守卫:OWNER 全通过;STAFF 按勾选组 */
export async function requirePerm(
  key: PermissionKey
): Promise<{ admin: GuardedAdmin } | { error: ReturnType<typeof jsonErr> }> {
  const admin = await getGuardedAdmin();
  if (!admin) return { error: jsonErr("未登录或会话已过期", 401) };
  if (admin.role !== "STAFF" || admin.permissions.includes(key)) return { admin };
  return denied();
}
