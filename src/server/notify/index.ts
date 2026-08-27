import { getNotifyConfig, type NotifyConfig } from "@/lib/config";

/**
 * 邮件发送与管理员通知。
 *
 * 两层职责:
 *  - sendMail:通用发信(SMTP 配置来自「功能设置 → 邮件通知」),供密码重置等系统邮件使用;
 *    未配置 SMTP 或发送失败返回 false,不抛异常。
 *  - notifyAdmin:表单提交/用户投稿时给管理员发提醒,受「通知总开关」控制,
 *    未开启/未配置一律静默跳过,绝不影响提交本身(调用方 `void notifyAdmin(...)`,不 await)。
 *
 * nodemailer 用动态 import 加载:依赖缺失时走 catch 静默跳过,不拖垮接口。
 */

export interface MailPayload {
  to: string[];
  subject: string;
  lines: string[];
}

/** 通用发信;返回是否成功(未配置 SMTP / 发送失败均返回 false) */
export async function sendMail(payload: MailPayload): Promise<boolean> {
  let cfg: NotifyConfig;
  try {
    cfg = await getNotifyConfig();
  } catch (e) {
    console.error("[mail] 读取邮件配置失败:", e);
    return false;
  }
  if (!cfg.smtpHost.trim()) return false;

  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      host: cfg.smtpHost,
      port: cfg.smtpPort || 465,
      secure: cfg.smtpSecure,
      auth: cfg.smtpUser ? { user: cfg.smtpUser, pass: cfg.smtpPassword } : undefined,
    });

    const from = cfg.fromEmail
      ? `"${cfg.fromName || "AitionOWS"}" <${cfg.fromEmail}>`
      : cfg.smtpUser || undefined;

    await transporter.sendMail({
      from,
      to: payload.to,
      subject: payload.subject,
      text: payload.lines.join("\n"),
      html: payload.lines.map((l) => `<p>${l.replace(/</g, "&lt;")}</p>`).join(""),
    });
    return true;
  } catch (e) {
    console.error("[mail] 邮件发送失败:", e);
    return false;
  }
}

/** 管理员通知(总开关控制,静默失败) */
export async function notifyAdmin(subject: string, lines: string[]): Promise<void> {
  let cfg: NotifyConfig;
  try {
    cfg = await getNotifyConfig();
  } catch (e) {
    console.error("[notify] 读取通知配置失败:", e);
    return;
  }
  if (!cfg.enabled || !cfg.adminEmail.trim() || !cfg.smtpHost.trim()) return;

  const to = cfg.adminEmail
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (to.length === 0) return;

  await sendMail({ to, subject, lines });
}
