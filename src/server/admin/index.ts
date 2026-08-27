import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

/**
 * 管理员账号服务:登录查询、登录时间回写、改密。
 * 页面/接口不得直连 Prisma(README 铁律 1),管理员域逻辑统一收口在此。
 */

/** 登录:按用户名取管理员(含密码哈希);不存在返回 null */
export async function findAdminByUsername(username: string) {
  return prisma.adminUser.findUnique({ where: { username } });
}

/** 登录成功后回写最后登录时间(失败不阻塞登录) */
export async function touchAdminLogin(id: number) {
  try {
    await prisma.adminUser.update({ where: { id }, data: { lastLoginAt: new Date() } });
  } catch {
    /* 时间回写失败不影响登录 */
  }
}

/** 修改密码:校验原密码与默认口令,通过则更新;抛出用户可读的中文错误 */
export async function changeAdminPassword(id: number, oldPassword: string, newPassword: string) {
  const admin = await prisma.adminUser.findUnique({ where: { id } });
  if (!admin) throw new Error("账号不存在");
  if (!(await verifyPassword(oldPassword, admin.passwordHash))) {
    throw new Error("原密码错误");
  }
  if (newPassword === "admin888") throw new Error("新密码不能使用默认密码");
  await prisma.adminUser.update({
    where: { id },
    data: { passwordHash: await hashPassword(newPassword) },
  });
}
