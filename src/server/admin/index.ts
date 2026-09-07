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

// ============================================================
// V4.1 子账号与操作日志
// ============================================================
import { parsePermissions, serializePermissions } from "./permissions";
export { parsePermissions };

/** 带角色的管理员会话校验数据(查库;禁用立即生效,不依赖 7 天 token) */
export async function getAdminWithRole(id: number) {
  return prisma.adminUser.findUnique({
    where: { id },
    select: { id: true, username: true, displayName: true, role: true, status: true, permissions: true },
  });
}

/** 子账号列表(主账号管理页);不含密码哈希 */
export async function listAdminUsers() {
  const rows = await prisma.adminUser.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      status: true,
      permissions: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({ ...r, permissionList: parsePermissions(r.permissions) }));
}

export interface CreateStaffInput {
  username: string;
  password: string;
  displayName?: string;
  permissions: string[];
}

/** 创建子账号(STAFF):用户名唯一/密码强度交由调用方校验;权限收敛到合法组 */
export async function createStaffUser(input: CreateStaffInput) {
  const username = input.username.trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,32}$/.test(username)) throw new Error("用户名 2~32 位,仅小写字母/数字/下划线/连字符");
  if (input.password.length < 8) throw new Error("密码至少 8 位");
  const exists = await prisma.adminUser.findUnique({ where: { username } });
  if (exists) throw new Error("用户名已存在");
  return prisma.adminUser.create({
    data: {
      username,
      passwordHash: await hashPassword(input.password),
      displayName: input.displayName?.trim().slice(0, 40) || username,
      role: "STAFF",
      status: "ACTIVE",
      permissions: serializePermissions(input.permissions),
    },
    select: { id: true, username: true, role: true },
  });
}

export interface UpdateStaffInput {
  id: number;
  displayName?: string;
  permissions?: string[];
  status?: "ACTIVE" | "DISABLED";
  newPassword?: string;
}

/** 更新子账号(权限/显示名/禁用/重置密码);仅 STAFF 可被改,主账号不可在此降权 */
export async function updateStaffUser(input: UpdateStaffInput) {
  const row = await prisma.adminUser.findUnique({ where: { id: input.id } });
  if (!row) throw new Error("子账号不存在");
  if (row.role !== "STAFF") throw new Error("仅子账号可在此修改");
  await prisma.adminUser.update({
    where: { id: input.id },
    data: {
      ...(input.displayName !== undefined ? { displayName: input.displayName.trim().slice(0, 40) || row.username } : {}),
      ...(input.permissions !== undefined ? { permissions: serializePermissions(input.permissions) } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.newPassword ? { passwordHash: await hashPassword(input.newPassword) } : {}),
    },
  });
  return { ok: true };
}

/** 删除子账号(物理删;操作日志保留 adminName 快照不依赖本表) */
export async function deleteStaffUser(id: number) {
  const row = await prisma.adminUser.findUnique({ where: { id } });
  if (!row) throw new Error("子账号不存在");
  if (row.role !== "STAFF") throw new Error("仅子账号可删除");
  await prisma.adminUser.delete({ where: { id } });
  return { ok: true };
}

/** 写操作日志(审计);失败静默——日志问题不阻断业务(与邮件同 NFR 语义) */
export async function logAdmin(entry: {
  adminId?: number | null;
  adminName: string;
  action: string;
  target?: string | null;
  detail?: string | null;
  ip?: string | null;
}): Promise<void> {
  try {
    await prisma.adminLog.create({
      data: {
        adminId: entry.adminId ?? null,
        adminName: entry.adminName.slice(0, 80),
        action: entry.action.slice(0, 60),
        target: entry.target?.slice(0, 120) || null,
        detail: entry.detail?.slice(0, 500) || null,
        ip: entry.ip?.slice(0, 60) || null,
      },
    });
  } catch {
    /* 静默 */
  }
}

/** 操作日志查询(主账号审计页):按管理员/动作前缀/日期过滤,分页 */
export async function listAdminLogs(q: {
  adminId?: number;
  actionPrefix?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 10));
  const where: Record<string, unknown> = {};
  if (q.adminId) where.adminId = q.adminId;
  if (q.actionPrefix) where.action = { startsWith: q.actionPrefix };
  const createdAt: Record<string, Date> = {};
  if (q.from && /^\d{4}-\d{2}-\d{2}$/.test(q.from)) createdAt.gte = new Date(`${q.from}T00:00:00`);
  if (q.to && /^\d{4}-\d{2}-\d{2}$/.test(q.to)) createdAt.lte = new Date(`${q.to}T23:59:59.999`);
  if (Object.keys(createdAt).length) where.createdAt = createdAt;
  const [total, items] = await Promise.all([
    prisma.adminLog.count({ where }),
    prisma.adminLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { total, page, pageSize, items };
}
