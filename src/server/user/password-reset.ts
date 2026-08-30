import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { getBrandConfig } from "@/lib/config";
import { sendMail } from "@/server/notify";
import { renderPasswordResetEmail } from "@/server/notify/template";

/**
 * 忘记密码(邮件重置)服务:
 *  1) requestPasswordReset —— 生成一次性令牌(只存哈希),邮件发送重置链接
 *  2) resetPasswordWithToken —— 校验令牌并重置密码
 *
 * 安全约定:
 *  - 邮箱不存在也返回成功(防账号枚举),但不发邮件
 *  - 令牌 32 字节随机数,DB 只存 SHA-256 哈希;30 分钟过期;用后即焚
 *  - 申请新令牌时作废旧令牌,任一时刻只有一个有效令牌
 */

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 分钟

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** 申请重置:给该邮箱发送重置链接(SMTP 未配置/发送失败时抛错,由接口层提示用户) */
export async function requestPasswordReset(rawEmail: string, locale: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  // 防账号枚举:用户不存在时按成功处理(但不产生任何令牌与邮件)
  if (!user) return;

  // 作废旧令牌,保证任一时刻仅一个有效令牌
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = crypto.randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });

  const brand = await getBrandConfig();
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const resetUrl = `${base}/${locale}/reset-password?token=${token}`;
  const zh = locale.startsWith("zh");

  // 品牌化 HTML 模板(REQ-011):按请求界面语言输出 zh/en 文案;
  // 有效期 30 分钟与 TOKEN_TTL_MS 一致;lines 保留作为 text 纯文本兜底
  const html = await renderPasswordResetEmail({ locale, resetUrl, expireMinutes: 30 });

  const sent = await sendMail({
    to: [email],
    subject: zh ? `【${brand.siteName}】密码重置链接` : `[${brand.siteName}] Password reset`,
    lines: zh
      ? [
          "你好:",
          `我们收到了你在 ${brand.siteName} 的密码重置请求。请在 30 分钟内点击以下链接设置新密码:`,
          resetUrl,
          "如果这不是你的操作,请忽略本邮件,你的密码不会改变。",
        ]
      : [
          "Hello,",
          `We received a password reset request for your ${brand.siteName} account. Please set a new password within 30 minutes via the link below:`,
          resetUrl,
          "If you did not request this, please ignore this email. Your password will stay unchanged.",
        ],
    html,
  });

  if (!sent) {
    throw new Error(
      zh ? "站点邮件服务未配置或发送失败,请联系网站管理员" : "Email service is unavailable. Please contact the site administrator."
    );
  }
}

/** 用令牌重置密码;令牌无效/过期/已用则抛错 */
export async function resetPasswordWithToken(token: string, password: string): Promise<void> {
  if (password.length < 8) throw new Error("密码至少 8 位");
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    throw new Error("重置链接无效或已过期,请重新申请");
  }
  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: { passwordHash: await hashPassword(password) },
    }),
    prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
  ]);
}
