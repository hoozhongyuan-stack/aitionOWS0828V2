import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { USER_STATUS } from "@/types/domain";
import { toPublicUser, type PublicUser } from "./profile";

/**
 * 前台用户服务(需求 4.6):邮箱注册/登录、微信绑定、后台用户管理。
 * 隐私边界(NFR-001):companyName/country/province/city 仅供后台读写,
 * 任何前台用户响应(me/login/register)必须经 toPublicUser 白名单序列化。
 *
 * 用户资料域(V3.0 REQ-009)已拆分至 ./profile(独立可测量模块,NFR-005 覆盖率口径);
 * 此处显式 re-export 保持既有导入路径(@/server/user)不变。
 */
export {
  toPublicUser,
  adminUpdateProfile,
  userProfileSchema,
  USER_PROFILE_FIELDS,
} from "./profile";
export type { PublicUser, UserProfileField } from "./profile";

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
export async function listUsersAdmin(opts: { page?: number; pageSize?: number; keyword?: string; q?: string }) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 10)); // V4.0.2:默认 10,可 50/100
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
  // 订单数(V4.0.2):Order.userId 无外键关系(快照模式),按当前页用户 groupBy 统计附加
  const ids = items.map((u) => u.id);
  const orderCounts = await prisma.order.groupBy({
    by: ["userId"],
    where: { userId: { in: ids } },
    _count: { _all: true },
  });
  const countMap = new Map(orderCounts.map((g) => [g.userId, g._count._all]));
  return {
    total,
    page,
    pageSize,
    items: items.map((u) => ({ ...u, orderCount: countMap.get(u.id) ?? 0 })),
  };
}

/** 后台:启用/禁用用户 */
export async function setUserStatus(id: number, status: string) {
  if (status !== USER_STATUS.ACTIVE && status !== USER_STATUS.DISABLED) throw new Error("非法状态");
  await prisma.user.update({ where: { id }, data: { status } });
}

/** 当前登录用户信息(仅 ACTIVE 账号);禁用/不存在返回 null。供 /api/auth/me 等展示场景。
 * 经 toPublicUser 白名单序列化,绝不携带公司/地区资料字段(NFR-001)。
 */
export async function getActiveUserInfo(id: number): Promise<PublicUser | null> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.status !== USER_STATUS.ACTIVE) return null;
  return toPublicUser(user);
}
