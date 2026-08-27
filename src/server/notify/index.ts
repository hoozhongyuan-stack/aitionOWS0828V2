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

/**
 * 头部净化:剥除 CR/LF/NUL。
 * subject/fromName 会拼进 SMTP 头(投稿通知的标题是用户可控输入),
 * 换行注入可追加任意邮件头;不依赖 nodemailer 内部是否兜底,入库前统一剥除。
 */
function headerSafe(value: string): string {
  return value.replace(/[\r\n\0]+/g, " ").trim();
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

  // 显式短超时:SMTP 端口被防火墙 DROP 时默认超时可达分钟级,会把请求挂死
  const TIMEOUTS = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 };

  let closeTransporter: (() => void) | null = null;
  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      host: cfg.smtpHost,
      port: cfg.smtpPort || 465,
      secure: cfg.smtpSecure,
      auth: cfg.smtpUser ? { user: cfg.smtpUser, pass: cfg.smtpPassword } : undefined,
      ...TIMEOUTS,
    });
    closeTransporter = () => transporter.close();

    const fromName = headerSafe(cfg.fromName || "AitionOWS");
    const fromEmail = headerSafe(cfg.fromEmail);
    const from =
      fromEmail ? `"${fromName}" <${fromEmail}>` : cfg.smtpUser || undefined;

    const result = await transporter.sendMail({
      from,
      to: payload.to,
      subject: headerSafe(payload.subject),
      text: payload.lines.join("\n"),
      html: payload.lines.map((l) => `<p>${l.replace(/</g, "&lt;")}</p>`).join(""),
    });
    return !!result;
  } catch (e) {
    console.error("[mail] 邮件发送失败:", e);
    return false;
  } finally {
    // 每次调用独立建连,用完即关,防 socket 泄漏
    closeTransporter?.();
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
