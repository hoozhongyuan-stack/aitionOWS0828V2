import crypto from "node:crypto";
import { cookies } from "next/headers";
import { GUEST_COOKIE } from "@/lib/auth/session";

/**
 * 防刷工具(需求 4.8 / 4.5):
 * - 游客指纹:httpOnly cookie 随机 ID(点赞去重的游客路径)
 * - 内存滑动窗口限频:同 key 一段时间内最多 N 次
 */

/** 读取游客指纹;没有则生成(需在 Route Handler 中调用,响应时写回) */
export async function getOrCreateGuestKey(): Promise<{ key: string; isNew: boolean }> {
  const c = await cookies();
  const existing = c.get(GUEST_COOKIE)?.value;
  if (existing) return { key: existing, isNew: false };
  return { key: crypto.randomUUID(), isNew: true };
}

/** 把新游客指纹写回响应 */
export function guestCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 365 * 24 * 3600,
  };
}

// —— 内存限频 ——
const g = globalThis as unknown as { __aitionRate?: Map<string, number[]> };
const buckets = (g.__aitionRate ??= new Map<string, number[]>());

/**
 * 滑动窗口限频:返回 true 表示放行。
 * @param key   业务键(如 `like:1.2.3.4:55`)
 * @param limit 窗口内最大次数
 * @param windowMs 窗口毫秒
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    buckets.set(key, arr);
    return false;
  }
  arr.push(now);
  buckets.set(key, arr);
  // 简单清理,防内存膨胀
  if (buckets.size > 10000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t > windowMs)) buckets.delete(k);
    }
  }
  return true;
}

/** 生成提交指纹(表单防重复) */
export function fingerprint(...parts: (string | number)[]): string {
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}
