import { jsonOk, jsonErr, getClientIp } from "@/lib/api";
import { logAdmin } from "@/server/admin";
import { requirePerm } from "@/lib/auth/session";
import {
  listSubmissions,
  deleteSubmission,
  exportSubmissionsCsv,
  setSubmissionStatus,
} from "@/server/form";

/**
 * 表单数据管理:
 * GET ?formId=&page=&from=&to=          列表(日期筛选)
 * GET ?formId=&format=csv               CSV 导出
 * DELETE ?id=                           删除单条
 */
export async function GET(req: Request) {
  const guard = await requirePerm("content");
  if ("error" in guard) return guard.error;
  const sp = new URL(req.url).searchParams;
  const formId = Number(sp.get("formId"));
  if (!formId) return jsonErr("缺少 formId");

  if (sp.get("format") === "csv") {
    try {
      const { filename, csv } = await exportSubmissionsCsv(formId);
      return new Response(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        },
      });
    } catch (e) {
      return jsonErr(e instanceof Error ? e.message : "导出失败");
    }
  }

  return jsonOk(
    await listSubmissions({
      formId,
      page: Number(sp.get("page")) || 1,
      from: sp.get("from") || undefined,
      to: sp.get("to") || undefined,
      status: sp.get("status") || undefined,
    })
  );
}

/** 标记处理状态:PUT { id, status: "HANDLED" | "UNHANDLED" } */
export async function PUT(req: Request) {
  const guard = await requirePerm("content");
  const admin = "admin" in guard ? guard.admin : null;
  void logAdmin({ adminId: admin?.id ?? null, adminName: admin?.name ?? "?", action: "forms.submissions.put", ip: getClientIp(req) });
  if ("error" in guard) return guard.error;
  const body = (await req.json().catch(() => ({}))) as { id?: number; status?: string };
  if (!body.id || !body.status) return jsonErr("缺少 id/status");
  try {
    await setSubmissionStatus(Number(body.id), body.status);
    return jsonOk();
  } catch (e) {
    return jsonErr(e instanceof Error ? e.message : "操作失败");
  }
}

export async function DELETE(req: Request) {
  const guard = await requirePerm("content");
  const admin = "admin" in guard ? guard.admin : null;
  void logAdmin({ adminId: admin?.id ?? null, adminName: admin?.name ?? "?", action: "forms.submissions.delete", ip: getClientIp(req) });
  if ("error" in guard) return guard.error;
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return jsonErr("缺少 id");
  await deleteSubmission(id);
  return jsonOk();
}
