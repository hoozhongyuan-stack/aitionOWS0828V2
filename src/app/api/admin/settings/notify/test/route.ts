import { z } from "zod";
import { jsonOk, jsonErr, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { getNotifyConfig } from "@/lib/config";

/**
 * 发送测试邮件(通知设置页「发送测试邮件」按钮专用):
 * 直接用表单里当前填写的值发送,不要求先保存 —— 方便在保存前验证 SMTP 是否配置正确。
 * 密码字段若仍是脱敏占位串(未修改),则回退到数据库里已保存的真实密码。
 */

const MASK = "••••••••";

const schema = z.object({
  values: z.object({
    adminEmail: z.string().min(1, "请先填写管理员邮箱"),
    smtpHost: z.string().min(1, "请先填写 SMTP 服务器地址"),
    smtpPort: z.number().int(),
    smtpSecure: z.boolean(),
    smtpUser: z.string(),
    smtpPassword: z.string(),
    fromName: z.string(),
    fromEmail: z.string(),
  }),
});

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const parsed = await parseBody(req, schema);
  if (parsed.error) return parsed.error;
  const v = parsed.data.values;

  try {
    const current = await getNotifyConfig();
    const smtpPassword = v.smtpPassword === MASK ? current.smtpPassword : v.smtpPassword;

    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      host: v.smtpHost,
      port: v.smtpPort || 465,
      secure: v.smtpSecure,
      auth: v.smtpUser ? { user: v.smtpUser, pass: smtpPassword } : undefined,
    });

    const from = v.fromEmail ? `"${v.fromName || "AitionOWS"}" <${v.fromEmail}>` : v.smtpUser || undefined;
    const to = v.adminEmail
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (to.length === 0) return jsonErr("请先填写管理员邮箱");

    await transporter.sendMail({
      from,
      to,
      subject: "[AitionOWS] 这是一封测试邮件",
      text: "如果你收到这封邮件,说明通知邮箱配置正确。",
      html: "<p>如果你收到这封邮件,说明通知邮箱配置正确。</p>",
    });
    return jsonOk();
  } catch (e) {
    return jsonErr(e instanceof Error ? `发送失败:${e.message}` : "发送失败");
  }
}
