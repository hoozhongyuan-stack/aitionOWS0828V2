import { z } from "zod";
import { jsonOk, jsonErr, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { AGREEMENT_TYPE } from "@/types/domain";
import { getAgreementExact, saveAgreement } from "@/server/agreement";

/**
 * 用户协议管理:GET/PUT /api/admin/agreements
 * 类型:REGISTER(注册协议)/ PRIVACY(隐私政策),按语言存富文本。
 */

const putSchema = z.object({
  type: z.enum([AGREEMENT_TYPE.REGISTER, AGREEMENT_TYPE.PRIVACY]),
  locale: z.string().min(2),
  title: z.string().min(1, "请输入协议标题"),
  body: z.string(),
});

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const locale = url.searchParams.get("locale");
  if (!type || !locale) return jsonErr("缺少 type/locale");
  const row = await getAgreementExact(type, locale);
  return jsonOk(row ?? { type, locale, title: "", body: "" });
}

export async function PUT(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const parsed = await parseBody(req, putSchema);
  if (parsed.error) return parsed.error;
  const { type, locale, title, body } = parsed.data;
  await saveAgreement(type, locale, title, body);
  return jsonOk();
}
