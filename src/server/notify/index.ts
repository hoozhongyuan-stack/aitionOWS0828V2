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
  /** 纯文本正文;也是 html 缺省时的 text/降级 html 数据源 */
  lines: string[];
  /**
   * 品牌模板 HTML(由 template.ts 渲染,TASK-010)。提供时:
   *  - html 原样发送;
   *  - text 自动兜底为纯文本 —— lines 非空用 lines,否则剥离 HTML 标签的降级文本。
   * 未提供时保持旧行为(text=lines 拼接,html=转义 <p> 列表)。
   */
  html?: string;
}

/** html → 纯文本降级(text part 兜底用):剥 <style>/<script>/标签,还原常见实体 */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|table|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

    const html =
      payload.html ?? payload.lines.map((l) => `<p>${l.replace(/</g, "&lt;")}</p>`).join("");
    const text = payload.html
      ? payload.lines.length > 0
        ? payload.lines.join("\n")
        : htmlToText(payload.html)
      : payload.lines.join("\n");

    const result = await transporter.sendMail({
      from,
      to: payload.to,
      subject: headerSafe(payload.subject),
      text,
      html,
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
