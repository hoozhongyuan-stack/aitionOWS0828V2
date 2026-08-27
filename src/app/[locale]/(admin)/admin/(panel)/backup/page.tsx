"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet, apiPost, apiDelete } from "@/components/admin/api-client";
import { DatabaseBackup, FolderArchive, Package, Download, Trash2 } from "lucide-react";

/** 备份管理(需求 5):一键数据库/文件/完整备份,下载与删除 */

interface BackupRow {
  id: number;
  type: string;
  path: string;
  size: number;
  createdAt: string;
}

const TYPE_LABEL: Record<string, string> = { db: "数据库", files: "上传文件", full: "完整备份" };

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function BackupAdminPage() {
  const [rows, setRows] = useState<BackupRow[] | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  const load = useCallback(() => {
    apiGet<BackupRow[]>("/api/admin/backup")
      .then(setRows)
      .catch((e) => toast.error(e.message));
  }, []);
  useEffect(load, [load]);

  async function run(type: "db" | "files" | "full") {
    setRunning(type);
    try {
      await apiPost("/api/admin/backup", { type });
      toast.success("备份完成");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "备份失败");
    } finally {
      setRunning(null);
    }
  }

  async function remove(row: BackupRow) {
    if (!window.confirm(`确认删除备份「${row.path}」?`)) return;
    try {
      await apiDelete(`/api/admin/backup?id=${row.id}`);
      toast.success("已删除");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">备份</h1>
        <p className="text-sm text-muted-foreground">
          产物保存在服务器 backups/ 目录(Docker 部署时已挂载到宿主机),建议定期下载异地留存。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>一键备份</CardTitle>
          <CardDescription>数据库使用 SQLite 热备快照,备份期间站点正常访问</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button onClick={() => run("db")} disabled={!!running}>
            <DatabaseBackup className="h-4 w-4" />
            {running === "db" ? "备份中…" : "备份数据库"}
          </Button>
          <Button variant="outline" onClick={() => run("files")} disabled={!!running}>
            <FolderArchive className="h-4 w-4" />
            {running === "files" ? "备份中…" : "备份上传文件"}
          </Button>
          <Button variant="outline" onClick={() => run("full")} disabled={!!running}>
            <Package className="h-4 w-4" />
            {running === "full" ? "备份中…" : "完整备份"}
          </Button>
        </CardContent>
      </Card>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>文件</TableHead>
            <TableHead>类型</TableHead>
            <TableHead>大小</TableHead>
            <TableHead>时间</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows?.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                暂无备份记录
              </TableCell>
            </TableRow>
          )}
          {rows?.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-mono text-xs">{r.path}</TableCell>
              <TableCell>
                <Badge variant="outline">{TYPE_LABEL[r.type] ?? r.type}</Badge>
              </TableCell>
              <TableCell>{fmtSize(r.size)}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {new Date(r.createdAt).toLocaleString("zh-CN")}
              </TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="sm" asChild title="下载">
                  <a href={`/api/admin/backup?download=${r.id}`}>
                    <Download className="h-4 w-4" />
                  </a>
                </Button>
                <Button variant="ghost" size="sm" onClick={() => remove(r)}>
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
