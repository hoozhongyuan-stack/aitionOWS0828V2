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
  "layout",
  "brand",
  "features",
  "upload",
  "seo",
  "wechat",
  "notify",
  "errors",
  "shop",
]);

const SECRET_KEYS: Record<string, string[]> = {
  wechat: ["appSecret", "h5AppSecret"],
  notify: ["smtpPassword"],
};
const MASK = "••••••••"; // 前端展示与"未修改"占位

const putSchema = z.object({ values: z.record(z.string(), z.unknown()) });

/**
 * theme 组字段级白名单:值最终会拼进全站 <style> 注入(src/lib/theme.ts),
 * 非法内容可逃逸 style 标签形成存储型 XSS,必须在写入边界校验。
 * (buildThemeCss 侧另有防御性净化兜底历史脏数据。)
 */
const COLOR =
  /^(#[0-9a-fA-F]{6}|[0-9]{1,3}(\.[0-9]+)? [0-9]{1,3}(\.[0-9]+)?% [0-9]{1,3}(\.[0-9]+)?%)$/;
const PX = /^[0-9]{1,4}(\.[0-9]+)?px$/;
const LEN_UNIT = /^[0-9]{1,4}(\.[0-9]+)?(px|rem|em|%)?$/;
// 字体栈只禁止真正危险的字符(CSS 断句符与标签括号);正常字体名/回退列表均可通过
const FONT = /^[^<>{};\\`]*$/;

const themeSchema = z
  .object({
    primary: z.string().regex(COLOR).max(40),
    secondary: z.string().regex(COLOR).max(40),
    background: z.string().regex(COLOR).max(40),
    foreground: z.string().regex(COLOR).max(40),
    mutedTextColor: z.string().regex(COLOR).max(40),
    radius: z.string().regex(LEN_UNIT).max(10),
    fontSans: z.string().regex(FONT).max(200),
    fontHeading: z.string().regex(FONT).max(200),
    fontSize: z.string().regex(PX).max(10),
    lineHeight: z
      .string()
      .regex(/^[0-9](\.[0-9]+)?$/)
      .max(5),
    logoHeight: z.string().regex(PX).max(10),
    navFontSize: z.string().regex(PX).max(10),
    navBold: z.boolean(),
    preset: z.enum(["classic", "aurora"]), // V3.1.1 主题风格包
  })
  .partial()
  .passthrough(); // passthrough:保留未知键入库;CSS 注入面只消费上面已校验的字段

const layoutSchema = z
  .object({
    preset: z.enum(["grid", "hero-list", "split", "list", "magazine"]),
    sections: z
      .object({
        banners: z.boolean().optional(),
        latest: z.boolean().optional(),
        header: z.boolean().optional(),
      })
      .optional(),
    // V3.3 D 首页楼层:每层绑定栏目+样式+条数(读取侧 server/layout getHomeFloors 同口径容错)
    floors: z
      .array(
        z.object({
          categoryId: z.number().int().positive(),
          style: z.enum(["grid3", "list", "feature"]).optional(),
          limit: z.number().int().min(1).max(12).optional(),
          title: z.string().max(60).optional(),
          visible: z.boolean().optional(),
        })
      )
      .max(8)
      .optional(),
  })
  .partial()
  .passthrough();

// V4.0 商店设置:币种 ISO 代码/付款指引/运费(整数分)
const shopSchema = z
  .object({
    currency: z.string().regex(/^[A-Z]{3}$/).optional(),
    paymentInfo: z.string().max(2000).optional(),
    shippingFeeCents: z.number().int().min(0).optional(),
    freeShippingOverCents: z.number().int().min(0).nullable().optional(),
  })
  .partial();

function validateGroup(
  group: string,
  values: Record<string, unknown>
): ReturnType<typeof jsonErr> | null {
  if (group === "layout") {
    const r = layoutSchema.safeParse(values);
    if (!r.success) {
      const first = r.error.issues[0];
      return jsonErr(`布局配置格式不正确:${first?.path?.join(".") ?? ""} ${first?.message ?? ""}`.trim());
    }
    return null;
  }
  if (group === "shop") {
    const r = shopSchema.safeParse(values);
    if (!r.success) {
      const first = r.error.issues[0];
      return jsonErr(`商店设置格式不正确:${first?.path?.join(".") ?? ""} ${first?.message ?? ""}`.trim());
    }
    return null;
  }
  if (group !== "theme") return null;
  const r = themeSchema.safeParse(values);
  if (!r.success) {
    const first = r.error.issues[0];
    return jsonErr(
      `主题配置格式不正确:${first?.path?.join(".") ?? ""} ${first?.message ?? ""}`.trim()
    );
  }
  return null;
}

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

  const invalid = validateGroup(group, values);
  if (invalid) return invalid;

  await saveSettingGroup(group, values);
  return jsonOk();
}
