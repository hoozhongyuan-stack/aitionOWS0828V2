"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { confirmDialog } from "@/components/admin/dialogs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet, apiDelete } from "@/components/admin/api-client";
import { Plus, Pencil, Trash2, Database } from "lucide-react";

/** 表单列表(需求 4.5) */

interface FormRow {
  id: number;
  name: string;
  slug: string;
  relatedKey: string | null;
  enabled: boolean;
  antiDuplicate: boolean;
  createdAt: string;
  unhandledCount: number;
  _count: { submissions: number };
}

export default function FormsAdminPage() {
  const locale = useLocale();
  const [rows, setRows] = useState<FormRow[] | null>(null);

  const load = useCallback(() => {
    apiGet<FormRow[]>("/api/admin/forms")
      .then(setRows)
      .catch((e) => toast.error(e.message));
  }, []);
  useEffect(load, [load]);

  async function remove(row: FormRow) {
    if (!(await confirmDialog({ title: `确认删除表单「${row.name}」?其 ${row._count.submissions} 条提交数据将一并删除`, destructive: true })))
      return;
    try {
      await apiDelete(`/api/admin/forms?id=${row.id}`);
      toast.success("已删除");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  if (!rows) return <div className="text-sm text-muted-foreground">加载中…</div>;

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">表单管理</h1>
          <p className="text-sm text-muted-foreground">
            可视化配置获客表单;「关联标识」填 contact 出现在联系页,填栏目标识出现在对应栏目页底部。
          </p>
        </div>
        <Button asChild>
          <Link href={`/${locale}/admin/forms/edit/new`}>
            <Plus className="h-4 w-4" /> 新建表单
          </Link>
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>名称</TableHead>
            <TableHead>关联</TableHead>
            <TableHead>提交数</TableHead>
            <TableHead>状态</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                还没有表单,点击「新建表单」开始
              </TableCell>
            </TableRow>
          )}
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <div className="font-medium">{row.name}</div>
                <div className="font-mono text-xs text-muted-foreground">{row.slug}</div>
              </TableCell>
              <TableCell>
                {row.relatedKey ? <Badge variant="outline">{row.relatedKey}</Badge> : "-"}
              </TableCell>
              <TableCell>
                {row._count.submissions}
                {row.unhandledCount > 0 && (
                  <Badge className="ml-2" variant="destructive">
                    {row.unhandledCount} 未处理
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                {row.enabled ? (
                  <Badge variant="outline">启用</Badge>
                ) : (
                  <Badge variant="secondary">停用</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <Button variant="outline" size="sm" asChild title="提交数据">
                  <Link href={`/${locale}/admin/forms/data/${row.id}`}>
                    <Database className="mr-1 h-3.5 w-3.5" />
                    数据
                  </Link>
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/${locale}/admin/forms/edit/${row.id}`}>
                    <Pencil className="h-4 w-4" />
                  </Link>
                </Button>
                <Button variant="ghost" size="sm" onClick={() => remove(row)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
