/**
 * 签发管理员长期令牌 —— 供 MCP / 自动化工具等**程序化访问**使用
 * (对应 src/lib/auth/session.ts 的 `Authorization: Bearer` 读取分支)。
 *
 * 用法:
 *   npx tsx scripts/issue-admin-token.ts <用户名> [有效期]
 *
 * 示例:
 *   npx tsx scripts/issue-admin-token.ts workbuddy-bot 365d
 *   AUTH_SECRET='<与服务器一致>' npx tsx scripts/issue-admin-token.ts workbuddy-bot 365d   # 生产
 *
 * 安全须知:
 *   1. 令牌持有者获得该账号的**全部权限** —— 只签给最小权限的专用子账号
 *      (建议:后台新建 STAFF 账号,权限组只勾「内容管理」)
 *   2. 令牌视同密码:只放本地配置(如 ~/.workbuddy/mcp.json 的 env),不要提交仓库
 *   3. 系统无会话吊销体系:换密/禁用账号后旧令牌在有效期内仍可用;
 *      需要立即全部失效时改 AUTH_SECRET 并重启服务
 */
import { PrismaClient } from "@prisma/client";
import { SignJWT, jwtVerify } from "jose";
import { existsSync, readFileSync } from "node:fs";

/**
 * 本地便利:独立脚本不经过 Next,不会自动加载 .env。
 * 未显式提供 AUTH_SECRET 时尝试从项目根 .env 读取(生产仍以环境变量优先)。
 */
if (!process.env.AUTH_SECRET && existsSync(".env")) {
  const m = readFileSync(".env", "utf8").match(/^\s*AUTH_SECRET\s*=\s*(.+)$/m);
  if (m) process.env.AUTH_SECRET = m[1].trim().replace(/^["']|["']$/g, "");
}

const prisma = new PrismaClient();

/** 与 src/lib/auth/jwt.ts 完全一致的密钥口径(开发环境允许默认值,生产必须显式提供) */
function getSecret(): Uint8Array {
  const dev = process.env.NODE_ENV !== "production";
  const s = process.env.AUTH_SECRET || (dev ? "dev-insecure-secret-change-me" : "");
  if (!s) {
    console.error("✗ 缺少 AUTH_SECRET:生产环境必须显式提供,且与服务器 compose 中的值完全一致");
    process.exit(1);
  }
  return new TextEncoder().encode(s);
}

async function main() {
  const username = process.argv[2]?.trim();
  const expires = process.argv[3]?.trim() || "180d";

  if (!username) {
    console.error("用法: npx tsx scripts/issue-admin-token.ts <用户名> [有效期, 如 90d / 365d]");
    process.exit(1);
  }
  if (!/^[0-9]+(h|d|y)$/.test(expires)) {
    console.error(`✗ 有效期格式不正确:${expires}(示例:90d / 365d)`);
    process.exit(1);
  }

  const admin = await prisma.adminUser.findUnique({ where: { username } });
  if (!admin) {
    console.error(`✗ 未找到管理员账号:${username}`);
    process.exit(1);
  }
  if (admin.status !== "ACTIVE") {
    console.error(`✗ 账号已禁用(${admin.status}),不能签发令牌`);
    process.exit(1);
  }

  const name = admin.displayName || admin.username;
  const token = await new SignJWT({ typ: "admin", name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(admin.id))
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(getSecret());

  // 自检:签出的令牌必须能通过同一套校验(防止密钥口径不一致导致静默失效)
  const { payload } = await jwtVerify(token, getSecret());
  const exp = payload.exp ? new Date(payload.exp * 1000).toISOString() : "(无)";
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  console.log("✓ 令牌已签发\n");
  console.log(`  账号     : ${admin.username}（${name}）`);
  console.log(
    `  角色     : ${admin.role}${admin.role === "STAFF" ? ` · 权限组 ${admin.permissions ?? "[]"}` : "（主账号，全部权限）"}`
  );
  console.log(`  有效期至 : ${exp}`);
  console.log("\n令牌（妥善保管，不要提交到仓库）:\n");
  console.log(token);
  console.log("\n--- 验证示例（应返回业务 JSON 而非 401）---");
  console.log(`curl -s -H "Authorization: Bearer <上面那串>" \\`);
  console.log(`  ${base}/api/admin/contents | head -c 200`);
  if (admin.role !== "STAFF") {
    console.log("\n⚠️  这是主账号（OWNER）令牌，拥有站点全部权限（含备份下载、用户管理）。");
    console.log("    建议：后台新建只勾「内容管理」的 STAFF 子账号，用它的令牌。");
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("✗ 签发失败:", e instanceof Error ? e.message : e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
