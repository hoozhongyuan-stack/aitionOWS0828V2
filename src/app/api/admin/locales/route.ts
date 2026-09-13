import { z } from "zod";
import { logAdmin } from "@/server/admin";
import { jsonOk, jsonErr, parseBody, getClientIp } from "@/lib/api";
import { requireOwner, getGuardedAdmin } from "@/lib/auth/session";
import { getLocales, saveLocales } from "@/server/i18n";
import { routing } from "@/i18n/routing";

/**
 * 语言配置:GET/PUT /api/admin/locales
 * 语言集合受编译期 routing.locales 约束(新语言需加 messages 文件后登记)。
 *
 * 守卫按方法分离(V4.6.4):GET 是编辑器/投稿页渲染语言 Tab 的必需数据,非敏感——
 * 放开给任意已登录管理员(此前锁 requireOwner 导致有 content 权限的子账号无法发内容);
 * PUT(启停语言、改展示名)仍严格主账号专属。
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
  const admin = await getGuardedAdmin();
  if (!admin) return jsonErr("未登录或会话已过期", 401);
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
