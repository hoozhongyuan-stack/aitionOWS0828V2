import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { USER_STATUS } from "@/types/domain";

/**
 * 前台用户服务(需求 4.6):邮箱注册/登录、微信绑定、后台用户管理。
 */

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

/** 后台:用户列表(搜索 + 分页) */
export async function listUsersAdmin(opts: { page?: number; keyword?: string }) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = 20;
  const where = opts.keyword
    ? {
        OR: [{ email: { contains: opts.keyword } }, { nickname: { contains: opts.keyword } }],
      }
    : {};
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
        wechatOpenId: true,
        status: true,
        createdAt: true,
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
