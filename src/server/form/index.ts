import { prisma } from "@/lib/db";
import { parseFormFields, type FormField } from "@/types/form";
import { findSensitiveWord } from "@/lib/ugc/filter";
import { fingerprint } from "@/lib/ugc/anti-spam";
import { notifyAdmin } from "@/server/notify";
import { renderFormSubmissionNotify } from "@/server/notify/template";
import { routing } from "@/i18n/routing";

/**
 * 表单获客服务(需求 4.5):
 * 定义 CRUD、公开提交(服务端校验 + 防重复)、数据查看/删除/CSV 导出。
 */

// ---------------- 表单定义 ----------------

export interface FormInput {
  id?: number;
  name: string;
  slug: string;
  fields: FormField[];
  relatedKey: string | null; // 关联页面/栏目(contact / 栏目 slug)
  antiDuplicate: boolean;
  enabled: boolean;
}

export async function listForms() {
  const rows = await prisma.form.findMany({
    orderBy: { id: "desc" },
    include: { _count: { select: { submissions: true } } },
  });
  const ids = rows.map((r) => r.id);
  const unhandled = ids.length
    ? await prisma.formSubmission.groupBy({
        by: ["formId"],
        where: { formId: { in: ids }, status: "UNHANDLED" },
        _count: { _all: true },
      })
    : [];
  const map = new Map(unhandled.map((u) => [u.formId, u._count._all]));
  return rows.map((r) => ({ ...r, unhandledCount: map.get(r.id) ?? 0 }));
}

export async function getForm(id: number) {
  return prisma.form.findUnique({ where: { id } });
}

export async function saveForm(input: FormInput) {
  if (input.fields.length === 0) throw new Error("表单至少需要一个字段");
  const data = {
    name: input.name,
    slug: input.slug,
    schema: JSON.stringify(input.fields),
    relatedKey: input.relatedKey || null,
    antiDuplicate: input.antiDuplicate,
    enabled: input.enabled,
  };
  return input.id
    ? prisma.form.update({ where: { id: input.id }, data })
    : prisma.form.create({ data });
}

export async function deleteForm(id: number) {
  // 先解除文章挂载(formId 无外键,应用层维护一致性),再删表单(提交数据级联删除)
  await prisma.content.updateMany({ where: { formId: id }, data: { formId: null } });
  await prisma.form.delete({ where: { id } });
}

/** 前台:按关联键取启用的表单(场景化获客) */
export async function getFormByRelatedKey(relatedKey: string) {
  const form = await prisma.form.findFirst({
    where: { relatedKey, enabled: true },
    orderBy: { id: "desc" },
  });
  if (!form) return null;
  return { id: form.id, slug: form.slug, name: form.name, fields: parseFormFields(form.schema) };
}

/** 按 id 批量取**启用中**的表单(仅 slug/name):悬浮入口把 formId 解析成可跳转/可加载的表单用 */
export async function getEnabledFormsByIds(
  ids: readonly number[]
): Promise<Map<number, { slug: string; name: string }>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.form.findMany({
    where: { id: { in: [...ids] }, enabled: true },
    select: { id: true, slug: true, name: true },
  });
  return new Map(rows.map((r) => [r.id, { slug: r.slug, name: r.name }]));
}

export async function getFormBySlugPublic(slug: string) {
  const form = await prisma.form.findUnique({ where: { slug } });
  if (!form || !form.enabled) return null;
  return { id: form.id, slug: form.slug, name: form.name, fields: parseFormFields(form.schema) };
}

// ---------------- 提交 ----------------

/**
 * 公开提交:逐字段服务端校验(绕过前端直接 POST 也会被拦)。
 * @param sourceUrl 来源页(AC-014,路由层从 Referer 头提取并截断;可选)
 * @throws Error 中文校验信息
 */
export async function submitForm(input: {
  slug: string;
  data: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  sourceUrl?: string | null;
}) {
  const form = await prisma.form.findUnique({ where: { slug: input.slug } });
  if (!form || !form.enabled) throw new Error("表单不存在或已停用");
  const fields = parseFormFields(form.schema);

  // —— 服务端校验 ——
  const clean: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = input.data[f.id];
    const isEmpty =
      raw === undefined ||
      raw === null ||
      (typeof raw === "string" && raw.trim() === "") ||
      (Array.isArray(raw) && raw.length === 0);

    if (f.required && isEmpty) throw new Error(`「${f.label}」为必填项`);
    if (isEmpty) {
      clean[f.id] = null;
      continue;
    }

    if (f.type === "checkbox") {
      if (!Array.isArray(raw)) throw new Error(`「${f.label}」数据格式错误`);
      const opts = f.options ?? [];
      if (raw.some((v) => !opts.includes(String(v)))) throw new Error(`「${f.label}」包含非法选项`);
      clean[f.id] = raw.map(String);
    } else if (f.type === "radio" || f.type === "select") {
      if (!(f.options ?? []).includes(String(raw))) throw new Error(`「${f.label}」选项非法`);
      clean[f.id] = String(raw);
    } else {
      const val = String(raw).slice(0, 2000);
      if (f.pattern) {
        try {
          if (!new RegExp(f.pattern).test(val)) {
            throw new Error(f.patternMsg || `「${f.label}」格式不正确`);
          }
        } catch (e) {
          if (e instanceof Error && e.message.includes("格式")) throw e;
          // 非法正则配置:跳过校验(容错,不阻断获客)
        }
      }
      clean[f.id] = val;
    }
  }

  // —— 敏感词(文本字段拼接检测)——
  const textBlob = Object.values(clean)
    .filter((v): v is string => typeof v === "string")
    .join(" ");
  const hit = await findSensitiveWord(textBlob);
  if (hit) throw new Error("提交内容包含敏感词,请修改后重试");

  // —— 防重复提交(需求 4.5):同指纹 24h 内拒绝 ——
  const fp = fingerprint(form.id, input.ip ?? "", JSON.stringify(clean));
  if (form.antiDuplicate) {
    const dup = await prisma.formSubmission.findFirst({
      where: { fingerprint: fp, createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } },
    });
    if (dup) throw new Error("请勿重复提交相同内容");
  }

  await prisma.formSubmission.create({
    data: {
      formId: form.id,
      data: JSON.stringify(clean),
      ip: input.ip,
      userAgent: input.userAgent?.slice(0, 300) ?? null,
      fingerprint: fp,
    },
  });

  // 管理员邮件通知(REQ-012 品牌模板):不 await,失败也不影响用户提交;
  // html 传渲染 Promise → notifyAdmin 在静默门禁内等待,开关/静默语义与原 notifyAdminBranded 等价
  void notifyAdmin(`[AitionOWS] 收到新的表单提交:${form.name}`, [], renderFormSubmissionNotify({
    formName: form.name,
    fields: fields.map((f) => {
      const val = clean[f.id];
      return { label: f.label, value: Array.isArray(val) ? val.join("、") : String(val ?? "-") };
    }),
    // 来源页(AC-014):路由层从 Referer 提取;缺省时模板不渲染来源页区块
    sourceUrl: input.sourceUrl ?? undefined,
    ip: input.ip ?? undefined,
    submittedAt: new Date().toLocaleString("zh-CN"),
    // 后台表单数据页(绝对 URL);管理端语言固定为编译期默认语言
    adminUrl: `${(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "")}/${routing.defaultLocale}/admin/forms/data/${form.id}`,
  }));
}

// ---------------- 数据管理 ----------------

export async function listSubmissions(opts: {
  formId: number;
  page?: number;
  from?: string;
  to?: string;
  status?: string;
}) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = 20;
  const where = {
    formId: opts.formId,
    ...(opts.status === "UNHANDLED" || opts.status === "HANDLED" ? { status: opts.status } : {}),
    ...(opts.from || opts.to
      ? {
          createdAt: {
            ...(opts.from ? { gte: new Date(opts.from) } : {}),
            ...(opts.to ? { lte: new Date(opts.to + "T23:59:59") } : {}),
          },
        }
      : {}),
  };
  const [total, items] = await Promise.all([
    prisma.formSubmission.count({ where }),
    prisma.formSubmission.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { total, page, pageSize, items };
}

/** 标记提交数据为已处理/未处理 */
export async function setSubmissionStatus(id: number, status: string) {
  if (status !== "HANDLED" && status !== "UNHANDLED") throw new Error("非法的处理状态");
  await prisma.formSubmission.update({
    where: { id },
    data: { status, ...(status === "HANDLED" ? { handledAt: new Date() } : { handledAt: null }) },
  });
}

export async function deleteSubmission(id: number) {
  await prisma.formSubmission.delete({ where: { id } });
}

/** CSV 导出(带 BOM,Excel 中文不乱码) */
export async function exportSubmissionsCsv(
  formId: number
): Promise<{ filename: string; csv: string }> {
  const form = await prisma.form.findUnique({ where: { id: formId } });
  if (!form) throw new Error("表单不存在");
  const fields = parseFormFields(form.schema);
  const rows = await prisma.formSubmission.findMany({ where: { formId }, orderBy: { id: "asc" } });

  const esc = (v: unknown) => {
    let s = v == null ? "" : Array.isArray(v) ? v.join("、") : String(v);
    // 公式注入防护:Excel/WPS 会把 =+-@/Tab/CR 开头的单元格当公式执行,前置单引号强制按文本处理
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const statusLabel = (st: string) => (st === "HANDLED" ? "已处理" : "未处理");
  const header = ["提交时间", ...fields.map((f) => f.label), "处理状态", "IP"].map(esc).join(",");
  const lines = rows.map((r) => {
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(r.data);
    } catch {
      /* 忽略脏数据 */
    }
    return [
      r.createdAt.toLocaleString("zh-CN"),
      ...fields.map((f) => data[f.id]),
      statusLabel(r.status),
      r.ip ?? "",
    ]
      .map(esc)
      .join(",");
  });
  return {
    filename: `${form.name}-数据导出.csv`,
    csv: "﻿" + [header, ...lines].join("\r\n"), // BOM 前缀,Excel 中文兼容
  };
}
