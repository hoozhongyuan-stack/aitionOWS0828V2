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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiGet, apiDelete, apiPut } from "@/components/admin/api-client";
import type { FormField } from "@/types/form";
import { ArrowLeft, Check, Download, RotateCcw, Trash2 } from "lucide-react";

/**
 * 表单提交数据页:/admin/forms/data/[id]
 * 列表页「提交数据」的落地页。
 * 展示逐条提交明细(按字段 schema 展开)、状态筛选、标记处理、分页、删除与 CSV 导出。
 */

interface SubmissionRow {
  id: number;
  data: string;
  ip: string | null;
  status: string; // UNHANDLED / HANDLED
  handledAt: string | null;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  UNHANDLED: "未处理",
  HANDLED: "已处理",
};

export default function FormDataPage() {
  const { id } = useParams<{ id: string }>();
  const formId = Number(id);
  const locale = useLocale();

  const [formName, setFormName] = useState("");
  const [fields, setFields] = useState<FormField[]>([]);
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const pageSize = 20;

  useEffect(() => {
    apiGet<{ id: number; name: string; schema: string }[]>("/api/admin/forms")
      .then((all) => {
        const mine = all.find((r) => r.id === formId);
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
    const st = statusFilter !== "ALL" ? `&status=${statusFilter}` : "";
    apiGet<{ total: number; items: SubmissionRow[] }>(
      `/api/admin/forms/submissions?formId=${formId}&page=${page}${st}`
    )
      .then((d) => {
        setRows(d.items ?? []);
        setTotal(d.total ?? 0);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [formId, page, statusFilter]);

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

  /** 标记处理状态:HANDLED 已处理 / UNHANDLED 撤销回未处理 */
  async function mark(rowId: number, status: "HANDLED" | "UNHANDLED") {
    try {
      await apiPut("/api/admin/forms/submissions", { id: rowId, status });
      toast.success(status === "HANDLED" ? "已标记为已处理" : "已撤回未处理");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
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
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>提交记录</CardTitle>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部状态</SelectItem>
              <SelectItem value="UNHANDLED">未处理</SelectItem>
              <SelectItem value="HANDLED">已处理</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                {fields.map((f) => (
                  <TableHead key={f.id}>{f.label}</TableHead>
                ))}
                <TableHead>提交时间</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>IP</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={fields.length + 4}
                    className="h-24 text-center text-muted-foreground"
                  >
                    加载中…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={fields.length + 4}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {statusFilter === "ALL" ? "暂无提交数据" : "该筛选条件下暂无数据"}
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
                  const handled = r.status === "HANDLED";
                  return (
                    <TableRow key={r.id} className={handled ? "opacity-60" : undefined}>
                      {fields.map((f) => (
                        <TableCell key={f.id} className="max-w-56 truncate align-middle">
                          {cellText(f, parsed[f.id])}
                        </TableCell>
                      ))}
                      <TableCell className="whitespace-nowrap">
                        {new Date(r.createdAt).toLocaleString("zh-CN")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={handled ? "secondary" : "default"}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </Badge>
                        {handled && r.handledAt && (
                          <div className="mt-0.5 text-[10px] text-muted-foreground">
                            {new Date(r.handledAt).toLocaleString("zh-CN")}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{r.ip ?? "-"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            title={handled ? "撤销回未处理" : "标记为已处理"}
                            onClick={() => mark(r.id, handled ? "UNHANDLED" : "HANDLED")}
                          >
                            {handled ? (
                              <RotateCcw className="h-4 w-4" />
                            ) : (
                              <Check className="h-4 w-4 text-emerald-600" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => remove(r.id)}
                            title="删除"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
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
