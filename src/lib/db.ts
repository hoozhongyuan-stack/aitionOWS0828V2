import { PrismaClient } from "@prisma/client";

/**
 * Prisma Client 单例。
 * 开发环境下热重载会重复实例化,挂到 globalThis 复用,避免连接耗尽。
 * 约定:页面/Route Handler 不直接 import 本文件,应通过 src/server/** 服务层间接访问。
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** 创建客户端并启用 SQLite WAL 模式(读写并发更好,官网读多写少场景必开) */
function createClient() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
  // WAL 为持久化设置,写入一次即落库;附带调优 busy_timeout 降低并发写锁冲突
  client
    .$queryRawUnsafe("PRAGMA journal_mode=WAL;")
    .then(() => client.$queryRawUnsafe("PRAGMA busy_timeout=5000;"))
    .catch((e) => console.error("[db] 启用 WAL 失败:", e));
  return client;
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
