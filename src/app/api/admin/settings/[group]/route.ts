import { z } from "zod";
import { jsonOk, jsonErr, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { getSettingGroup, saveSettingGroup } from "@/server/setting";

/**
 * 通用配置读写:GET/PUT /api/admin/settings/[group]
 * - 分组白名单,防任意写入
 * - wechat 组的 secret 读取时脱敏;保存时收到脱敏占位串则保留原值
 */

const ALLOWED_GROUPS = new Set([
  "theme",
  "brand",
  "features",
  "upload",
  "seo",
  "wechat",
  "notify",
  "errors",
]);

const SECRET_KEYS: Record<string, string[]> = {
  wechat: ["appSecret", "h5AppSecret"],
  notify: ["smtpPassword"],
};
const MASK = "••••••••"; // 前端展示与"未修改"占位

const putSchema = z.object({ values: z.record(z.string(), z.unknown()) });

export async function GET(_req: Request, ctx: { params: Promise<{ group: string }> }) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const { group } = await ctx.params;
  if (!ALLOWED_GROUPS.has(group)) return jsonErr("未知配置分组", 404);

  const values = { ...(await getSettingGroup(group)) };
  for (const key of SECRET_KEYS[group] ?? []) {
    if (values[key]) values[key] = MASK; // 脱敏
  }
  return jsonOk(values);
}

export async function PUT(req: Request, ctx: { params: Promise<{ group: string }> }) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const { group } = await ctx.params;
  if (!ALLOWED_GROUPS.has(group)) return jsonErr("未知配置分组", 404);

  const parsed = await parseBody(req, putSchema);
  if (parsed.error) return parsed.error;
  const values = { ...parsed.data.values };

  // 脱敏占位串 → 不覆盖原值
  const current = await getSettingGroup(group);
  for (const key of SECRET_KEYS[group] ?? []) {
    if (values[key] === MASK) values[key] = current[key] ?? "";
  }

  await saveSettingGroup(group, values);
  return jsonOk();
}
