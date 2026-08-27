import { cookies } from "next/headers";
import { verifyToken } from "./jwt";
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
