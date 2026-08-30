import { prisma } from "@/lib/db";
import { z } from "zod";

/**
 * 用户资料域(需求 V3.0 REQ-009,独立可测量模块——NFR-005 覆盖率口径)。
 * 从 src/server/user/index.ts 拆出;index.ts 经 re-export 保持既有导入路径不变。
 *
 * 隐私边界(NFR-001):companyName/country/province/city 仅供后台读写,
 * 前台序列化白名单 toPublicUser 是唯一出口,绝不携带 4 个资料字段。
 */

// —— 前台序列化白名单(隐私边界唯一出口) ——

/** 前台可见的用户公开字段白名单 */
export interface PublicUser {
  id: number;
  email: string | null;
  nickname: string;
  avatarUrl: string | null;
}

/**
 * 前台序列化唯一出口:全量用户行进、白名单出。
 * 绝不返回 companyName/country/province/city(TEST-013 锁死)。
 */
export function toPublicUser(user: {
  id: number;
  email: string | null;
  nickname: string | null;
  avatarUrl: string | null;
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname || user.email?.split("@")[0] || `用户${user.id}`,
    avatarUrl: user.avatarUrl ?? null,
  };
}

// —— 后台用户资料维护(需求 V3.0 REQ-009) ——

export const USER_PROFILE_FIELDS = ["companyName", "country", "province", "city"] as const;
export type UserProfileField = (typeof USER_PROFILE_FIELDS)[number];

/** 资料字段约束:全可选自由文本、trim、长度上限 100 */
export const userProfileSchema = z.object({
  companyName: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
  province: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
});

/** 后台:更新用户资料(4 字段全部非必填,空串视为清空)。返回含 4 字段的管理侧回显对象 */
export async function adminUpdateProfile(
  id: number,
  data: Partial<Record<UserProfileField, string>>
): Promise<PublicUser & Record<UserProfileField, string | null>> {
  const parsed = userProfileSchema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(`参数错误:${first?.path?.join(".") ?? ""} ${first?.message ?? ""}`.trim());
  }
  const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new Error("用户不存在");

  const patch: Partial<Record<UserProfileField, string | null>> = {};
  for (const field of USER_PROFILE_FIELDS) {
    const v = parsed.data[field];
    if (v !== undefined) patch[field] = v === "" ? null : v;
  }
  await prisma.user.update({ where: { id }, data: patch });
  const user = await prisma.user.findUniqueOrThrow({ where: { id } });
  return {
    ...toPublicUser(user),
    companyName: user.companyName,
    country: user.country,
    province: user.province,
    city: user.city,
  };
}
