"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet, apiPost } from "@/components/admin/api-client";
import { Ban, CheckCircle2 } from "lucide-react";

/** 注册用户管理(需求 4.6):查看/搜索/禁用/启用 */

interface UserRow {
  id: number;
  email: string | null;
  nickname: string | null;
  wechatOpenId: string | null;
  status: string;
  createdAt: string;
  _count: { comments: number };
}
interface ListData {
  total: number;
  page: number;
  pageSize: number;
  items: UserRow[];
}

export default function UsersAdminPage() {
  const [data, setData] = useState<ListData | null>(null);
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    const q = new URLSearchParams({ page: String(page) });
    if (keyword) q.set("keyword", keyword);
    apiGet<ListData>(`/api/admin/users?${q}`)
      .then(setData)
      .catch((e) => toast.error(e.message));
  }, [page, keyword]);

  useEffect(load, [load]);

  async function toggle(user: UserRow) {
    const next = user.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    if (next === "DISABLED" && !window.confirm(`确认禁用用户「${user.nickname || user.email}」?禁用后立即无法登录`))
      return;
    try {
      await apiPost("/api/admin/users", { id: user.id, status: next });
      toast.success(next === "DISABLED" ? "已禁用" : "已启用");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">注册用户</h1>
        <p className="text-sm text-muted-foreground">共 {data?.total ?? "…"} 位用户;禁用后其会话与评论/投稿权限即刻失效。</p>
      </div>

      <Input
        value={keyword}
        onChange={(e) => {
          setKeyword(e.target.value);
          setPage(1);
        }}
        placeholder="搜索邮箱 / 昵称…"
        className="w-64"
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>用户</TableHead>
            <TableHead>登录方式</TableHead>
            <TableHead>评论数</TableHead>
            <TableHead>注册时间</TableHead>
            <TableHead>状态</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                暂无注册用户
              </TableCell>
            </TableRow>
          )}
          {data?.items.map((u) => (
            <TableRow key={u.id}>
              <TableCell>
                <div className="font-medium">{u.nickname || "-"}</div>
                <div className="text-xs text-muted-foreground">{u.email || "-"}</div>
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  {u.email && <Badge variant="outline">邮箱</Badge>}
                  {u.wechatOpenId && <Badge variant="outline">微信</Badge>}
                </div>
              </TableCell>
              <TableCell>{u._count.comments}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {new Date(u.createdAt).toLocaleDateString("zh-CN")}
              </TableCell>
              <TableCell>
                {u.status === "ACTIVE" ? (
                  <Badge variant="outline">正常</Badge>
                ) : (
                  <Badge variant="destructive">已禁用</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="sm" onClick={() => toggle(u)}>
                  {u.status === "ACTIVE" ? (
                    <>
                      <Ban className="h-4 w-4" /> 禁用
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" /> 启用
                    </>
                  )}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            上一页
          </Button>
          <span className="text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            下一页
          </Button>
        </div>
      )}
    </div>
  );
}
