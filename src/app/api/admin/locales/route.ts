import { z } from "zod";
import { logAdmin } from "@/server/admin";
import { jsonOk, jsonErr, parseBody, getClientIp } from "@/lib/api";
import { requireOwner } from "@/lib/auth/session";
import { getLocales, saveLocales } from "@/server/i18n";
import { routing } from "@/i18n/routing";

/**
 * 语言配置:GET/PUT /api/admin/locales
 * 语言集合受编译期 routing.locales 约束(新语言需加 messages 文件后登记)。
 */

const putSchema = z.object({
  locales: z.array(
    z.object({
      code: z.string().min(2),
      name: z.string().min(1),
      isDefault: z.boolean(),
      enabled: z.boolean(),
      sort: z.number().int(),
    })
  ),
});

export async function GET() {
  const guard = await requireOwner();
  if ("error" in guard) return guard.error;
  return jsonOk({ locales: await getLocales(), supported: routing.locales });
}

export async function PUT(req: Request) {
  const guard = await requireOwner();
  const admin = "admin" in guard ? guard.admin : null;
  void logAdmin({ adminId: admin?.id ?? null, adminName: admin?.name ?? "?", action: "locales.put", ip: getClientIp(req) });
  if ("error" in guard) return guard.error;
  const parsed = await parseBody(req, putSchema);
  if (parsed.error) return parsed.error;

  for (const l of parsed.data.locales) {
    if (!routing.locales.includes(l.code as (typeof routing.locales)[number])) {
      return jsonErr(`不支持的语言:${l.code}(需先在模板中登记 messages 文件)`);
    }
  }
  try {
    await saveLocales(parsed.data.locales);
  } catch (e) {
    return jsonErr(e instanceof Error ? e.message : "保存失败");
  }
  return jsonOk();
}
