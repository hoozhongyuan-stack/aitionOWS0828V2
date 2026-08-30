import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { USER_STATUS } from "@/types/domain";
import { z } from "zod";

/**
 * 前台用户服务(需求 4.6):邮箱注册/登录、微信绑定、后台用户管理。
 * 隐私边界(NFR-001):companyName/country/province/city 仅供后台读写,
 * 任何前台用户响应(me/login/register)必须经 toPublicUser 白名单序列化。
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

/** 邮箱注册(唯一性校验 + bcrypt) */
export async function registerByEmail(input: { email: string; password: string; nickname?: string }) {
  const email = input.email.trim().toLowerCase();
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) throw new Error("该邮箱已注册,请直接登录");
  return prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(input.password),
      nickname: input.nickname?.trim() || email.split("@")[0],
    },
  });
}

/** 邮箱登录(校验密码与账号状态) */
export async function loginByEmail(input: { email: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new Error("邮箱或密码错误");
  }
  if (user.status !== USER_STATUS.ACTIVE) throw new Error("账号已被禁用,请联系网站管理员");
  return user;
}

/** 微信登录:按 openid 查找或创建用户 */
export async function loginByWechat(input: { openId: string; unionId?: string | null; nickname?: string | null }) {
  let user = await prisma.user.findUnique({ where: { wechatOpenId: input.openId } });
  if (!user && input.unionId) {
    user = await prisma.user.findUnique({ where: { wechatUnionId: input.unionId } });
  }
  if (!user) {
    user = await prisma.user.create({
      data: {
        wechatOpenId: input.openId,
        wechatUnionId: input.unionId ?? null,
        nickname: input.nickname || "微信用户",
      },
    });
  }
  if (user.status !== USER_STATUS.ACTIVE) throw new Error("账号已被禁用,请联系网站管理员");
  return user;
}

/** 后台:用户列表(搜索 + 分页)。
 * keyword:邮箱/昵称模糊搜索;q:公司名称模糊搜索(REQ-009,可与 keyword 叠加)。
 * 列表项包含 4 个资料字段,供后台编辑弹窗回显(仅后台出口,NFR-001 不适用)。
 */
export async function listUsersAdmin(opts: { page?: number; keyword?: string; q?: string }) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = 20;
  const where = {
    ...(opts.keyword
      ? {
          OR: [{ email: { contains: opts.keyword } }, { nickname: { contains: opts.keyword } }],
        }
      : {}),
    ...(opts.q ? { companyName: { contains: opts.q } } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        email: true,
        nickname: true,
        avatarUrl: true,
        wechatOpenId: true,
        status: true,
        createdAt: true,
        companyName: true,
        country: true,
        province: true,
        city: true,
        _count: { select: { comments: true } },
      },
    }),
  ]);
  return { total, page, pageSize, items };
}

/** 后台:启用/禁用用户 */
export async function setUserStatus(id: number, status: string) {
  if (status !== USER_STATUS.ACTIVE && status !== USER_STATUS.DISABLED) throw new Error("非法状态");
  await prisma.user.update({ where: { id }, data: { status } });
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

/** 当前登录用户信息(仅 ACTIVE 账号);禁用/不存在返回 null。供 /api/auth/me 等展示场景。
 * 经 toPublicUser 白名单序列化,绝不携带公司/地区资料字段(NFR-001)。
 */
export async function getActiveUserInfo(id: number): Promise<PublicUser | null> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.status !== USER_STATUS.ACTIVE) return null;
  return toPublicUser(user);
}
