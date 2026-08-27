"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet, apiDelete } from "@/components/admin/api-client";
import type { FormField } from "@/types/form";
import { ArrowLeft, Download, Trash2 } from "lucide-react";

/**
 * 表单提交数据页:/admin/forms/data/[id]
 * 列表页「提交数据」图标的落地页(此前链接指向不存在的路由,点击 404)。
 * 展示逐条提交明细(按字段 schema 展开)、分页、单条删除与 CSV 导出(API 已有)。
 */

interface SubmissionRow {
  id: number;
  data: string;
  ip: string | null;
  createdAt: string;
}

export default function FormDataPage() {
  const { id } = useParams<{ id: string }>();
  const formId = Number(id);
  const locale = useLocale();

  const [formName, setFormName] = useState("");
  const [fields, setFields] = useState<FormField[]>([]);
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const pageSize = 20;

  useEffect(() => {
    apiGet<{ id: number; name: string; schema: string }[]>("/api/admin/forms")
      .then((rows) => {
        const mine = rows.find((r) => r.id === formId);
        if (mine) {
          setFormName(mine.name);
          try {
            setFields(JSON.parse(mine.schema) as FormField[]);
          } catch {
            /* schema 损坏时按原始 JSON 展示 */
          }
        }
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "加载表单失败"));
  }, [formId]);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<{ total: number; items: SubmissionRow[] }>(
      `/api/admin/forms/submissions?formId=${formId}&page=${page}`
    )
      .then((d) => {
        setRows(d.items ?? []);
        setTotal(d.total ?? 0);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [formId, page]);

  useEffect(load, [load]);

  async function remove(rowId: number) {
    if (!window.confirm("确认删除这条提交数据?此操作不可恢复")) return;
    try {
      await apiDelete(`/api/admin/forms/submissions?id=${rowId}`);
      toast.success("已删除");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  /** 字段值 → 展示文本(多选拼接、文件给链接、其余原样) */
  function cellText(field: FormField, raw: unknown): string {
    if (raw == null || raw === "") return "-";
    if (Array.isArray(raw)) return raw.join("、");
    if (field.type === "file" && typeof raw === "string") return raw;
    return String(raw);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            提交数据:{formName || `表单 #${formId}`}
          </h1>
          <p className="text-sm text-muted-foreground">共 {total} 条提交</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/${locale}/admin/forms`}>
              <ArrowLeft className="mr-1 h-4 w-4" /> 返回列表
            </Link>
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              window.open(`/api/admin/forms/submissions?formId=${formId}&format=csv`, "_blank")
            }
            disabled={total === 0}
          >
            <Download className="mr-1 h-4 w-4" /> 导出 CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>提交记录</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                {fields.map((f) => (
                  <TableHead key={f.id}>{f.label}</TableHead>
                ))}
                <TableHead>提交时间</TableHead>
                <TableHead>IP</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={fields.length + 3}
                    className="h-24 text-center text-muted-foreground"
                  >
                    加载中…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={fields.length + 3}
                    className="h-24 text-center text-muted-foreground"
                  >
                    暂无提交数据
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  let parsed: Record<string, unknown> = {};
                  try {
                    parsed = JSON.parse(r.data) as Record<string, unknown>;
                  } catch {
                    /* 脏数据按空对象展示 */
                  }
                  return (
                    <TableRow key={r.id}>
                      {fields.map((f) => (
                        <TableCell key={f.id} className="max-w-56 truncate align-middle">
                          {cellText(f, parsed[f.id])}
                        </TableCell>
                      ))}
                      <TableCell className="whitespace-nowrap">
                        {new Date(r.createdAt).toLocaleString("zh-CN")}
                      </TableCell>
                      <TableCell>{r.ip ?? "-"}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => remove(r.id)} title="删除">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {total > pageSize && (
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                第 {page} / {totalPages} 页
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  下一页
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
