import { z } from "zod";
import { logAdmin } from "@/server/admin";
import { jsonOk, jsonErr, parseBody, getClientIp } from "@/lib/api";
import { requireOwner } from "@/lib/auth/session";
import { agreementTypeSchema } from "@/types/domain";
import { getAgreementExact, saveAgreement } from "@/server/agreement";

/**
 * 用户协议管理:GET/PUT /api/admin/agreements
 * 类型:REGISTER/PRIVACY/COOKIES(V4.0.2 起),按语言存富文本。
 * 校验用 agreementTypeSchema(nativeEnum,与前端下拉自动同步,新增类型不再漏改此处)。
 */

const putSchema = z.object({
  type: agreementTypeSchema,
  locale: z.string().min(2),
  title: z.string().min(1, "请输入协议标题"),
  body: z.string(),
});

export async function GET(req: Request) {
  const guard = await requireOwner();
  if ("error" in guard) return guard.error;
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const locale = url.searchParams.get("locale");
  if (!type || !locale) return jsonErr("缺少 type/locale");
  const row = await getAgreementExact(type, locale);
  return jsonOk(row ?? { type, locale, title: "", body: "" });
}

export async function PUT(req: Request) {
  const guard = await requireOwner();
  const admin = "admin" in guard ? guard.admin : null;
  void logAdmin({ adminId: admin?.id ?? null, adminName: admin?.name ?? "?", action: "agreements.put", ip: getClientIp(req) });
  if ("error" in guard) return guard.error;
  const parsed = await parseBody(req, putSchema);
  if (parsed.error) return parsed.error;
  const { type, locale, title, body } = parsed.data;
  await saveAgreement(type, locale, title, body);
  return jsonOk();
}
