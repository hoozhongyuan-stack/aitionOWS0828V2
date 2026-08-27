import { z } from "zod";
import { jsonOk, jsonErr, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { listContentsAdmin, saveContent, getContentForEdit, deleteContent } from "@/server/content";
import { CONTENT_STATUS } from "@/types/domain";

/**
 * 内容管理:
 * GET  ?id= 单条 | ?page=&categoryId=&status=&keyword= 列表
 * PUT  新建/更新(含多语言翻译与单页 TDK)
 * DELETE ?id=
 *
 * 互动统计(阅读/赞/转)不提供任何写接口 —— 测试反馈缺陷8:后台不应可修改真实互动数据,
 * 一律只读展示,即使超级管理员也不例外。历史上的 POST(修改互动统计)接口已下线。
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
  translations: z.array(
    z.object({
      locale: z.string(),
      title: z.string(),
      summary: z.string().nullable().optional(),
      body: z.string(),
      seoTitle: z.string().nullable().optional(),
      seoKeywords: z.string().nullable().optional(),
      seoDesc: z.string().nullable().optional(),
    })
  ),
});

export async function GET(req: Request) {
  const guard = await requireAdmin();
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
  const guard = await requireAdmin();
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
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return jsonErr("缺少 id");
  await deleteContent(id);
  return jsonOk();
}
