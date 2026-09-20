import { z } from "zod";
import { logAdmin } from "@/server/admin";
import { jsonOk, jsonErr, parseBody, getClientIp } from "@/lib/api";
import { requirePerm } from "@/lib/auth/session";
import { listContentsAdmin, saveContent, getContentForEdit, deleteContent } from "@/server/content";
import { CONTENT_STATUS } from "@/types/domain";

/**
 * 内容管理:
 * GET  ?id= 单条 | ?page=&categoryId=&status=&keyword= 列表
 * PUT  新建/更新(含多语言翻译、单页 TDK 与商品 gallery/specs)
 * DELETE ?id=
 *
 * 互动统计(阅读/赞/转/藏)不提供任何写接口 —— 测试反馈缺陷8:后台不应可修改真实互动数据,
 * 一律只读展示,即使超级管理员也不例外。历史上的 POST(修改互动统计)接口已下线;
 * favoriteCount(V3.0)与 viewCount 等对称,仅随收藏接口由应用层同步维护。
 */

const putSchema = z.object({
  id: z.number().int().optional(),
  slug: z
    .string()
    .min(1, "请输入内容标识")
    .regex(/^[a-z0-9-]+$/, "标识仅允许小写字母、数字与连字符"),
  categoryId: z.number().int(),
  status: z.enum([
    CONTENT_STATUS.DRAFT,
    CONTENT_STATUS.PUBLISHED,
    CONTENT_STATUS.OFFLINE,
    CONTENT_STATUS.SCHEDULED,
  ]),
  authorName: z.string().trim().min(1, "请填写作者"),
  coverUrl: z.string().nullable(),
  formId: z.number().int().nullable().optional(),
  publishAt: z.string().nullable(),
  // 商品字段(V3.0,仅 product 栏目内容使用;服务层序列化为 JSON 串存储)
  gallery: z
    .array(z.string().trim().min(1, "图集图片路径不能为空"))
    .max(20, "图集最多上传 20 张图片")
    .nullable()
    .optional(),
  specs: z
    .array(
      z.object({
        k: z.string().trim().min(1, "参数名不能为空"),
        v: z.string().trim().min(1, "参数值不能为空"),
      })
    )
    .max(50, "规格参数最多 50 行")
    .nullable()
    .optional(),
  // 交易字段(V4.0/V4.0.2):zod 未声明会被剥除导致"保存不报错但不生效"(生产事故,必查)
  price: z
    .object({
      priceCents: z.number().int().min(0).nullable(), // null=清除价格(仅询盘)
      currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
    })
    .nullable()
    .optional(),
  spu: z
    .string()
    .min(0)
    .max(60)
    .nullable()
    .optional(),
  // 拟真互动数据(V4.8.0):不声明会被 zod 剥除 → "保存不报错但不生效"(历史事故同款)
  statsMode: z.enum(["AUTO", "OFF", "CUSTOM"]).optional(),
  // 置顶(V4.8.1):ISO 字符串;null=取消置顶 / 到期时间留空为永久
  pinnedAt: z.string().nullable().optional(),
  pinExpiresAt: z.string().nullable().optional(),
  statsBase: z.number().int().min(1).max(1_000_000).nullable().optional(),
  statsSalt: z.string().max(64).nullable().optional(),
  translations: z.array(
    z.object({
      locale: z.string(),
      title: z.string(),
      summary: z.string().nullable().optional(),
      body: z.string(),
      seoTitle: z.string().nullable().optional(),
      seoKeywords: z.string().nullable().optional(),
      seoDesc: z.string().nullable().optional(),
      // 每语言规格参数(V3.1 REQ-001 写入语义矩阵):数组=该语言值(可空数组)/
      // null=该语言无规格 / 缺省(undefined)=服务层快照回填保留既有
      specs: z
        .array(z.object({ k: z.string(), v: z.string() }))
        .max(50, "规格参数最多 50 行")
        .nullable()
        .optional(),
    })
  ),
});

export async function GET(req: Request) {
  const guard = await requirePerm("content");
  if ("error" in guard) return guard.error;
  const sp = new URL(req.url).searchParams;
  const id = sp.get("id");
  if (id) {
    const content = await getContentForEdit(Number(id));
    if (!content) return jsonErr("内容不存在", 404);
    return jsonOk(content);
  }
  return jsonOk(
    await listContentsAdmin({
      page: Number(sp.get("page")) || 1,
      // V4.7.2:补上 pageSize 透传 —— 此前漏读该参数,服务层回落到默认值,
      // 导致页面「每页 10 条」写着 10 却实际拉 20 条、两套分页器算出不同页数
      pageSize: Number(sp.get("pageSize")) || undefined,
      categoryId: sp.get("categoryId") ? Number(sp.get("categoryId")) : undefined,
      status: sp.get("status") || undefined,
      source: sp.get("source") || undefined,
      keyword: sp.get("keyword") || undefined,
      dateFrom: sp.get("dateFrom") || undefined,
      dateTo: sp.get("dateTo") || undefined,
    })
  );
}

export async function PUT(req: Request) {
  const guard = await requirePerm("content");
  const admin = "admin" in guard ? guard.admin : null;
  void logAdmin({ adminId: admin?.id ?? null, adminName: admin?.name ?? "?", action: "content.put", ip: getClientIp(req) });
  if ("error" in guard) return guard.error;
  const parsed = await parseBody(req, putSchema);
  if (parsed.error) return parsed.error;
  try {
    const content = await saveContent(parsed.data);
    return jsonOk(content);
  } catch (e) {
    return jsonErr(e instanceof Error ? e.message : "保存失败");
  }
}

export async function DELETE(req: Request) {
  const guard = await requirePerm("content");
  const admin = "admin" in guard ? guard.admin : null;
  void logAdmin({ adminId: admin?.id ?? null, adminName: admin?.name ?? "?", action: "content.delete", ip: getClientIp(req) });
  if ("error" in guard) return guard.error;
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return jsonErr("缺少 id");
  await deleteContent(id);
  return jsonOk();
}
