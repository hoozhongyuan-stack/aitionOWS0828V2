"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/admin/dialogs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/components/admin/api-client";

/**
 * 子账号管理(V4.1,主账号专属):预定义权限组勾选;创建/编辑(权限/禁用/重置密码)/删除。
 */

interface StaffRow {
  id: number;
  username: string;
  displayName: string | null;
  role: string;
  status: string;
  permissionList: string[];
  lastLoginAt: string | null;
  createdAt: string;
}

const GROUPS = [
  { key: "content", label: "内容管理" },
  { key: "commerce", label: "交易管理" },
  { key: "moderation", label: "互动审核" },
  { key: "geo", label: "GEO 监测" },
];

export default function AdminUsersPage() {
  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [dialog, setDialog] = useState<null | "create" | "edit">(null);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [form, setForm] = useState({ username: "", password: "", displayName: "", permissions: [] as string[] });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiGet<StaffRow[]>("/api/admin/admin-users")
      .then(setRows)
      .catch(() => toast.error("加载失败"));
  }, []);
  useEffect(load, [load]);

  function openCreate() {
    setEditing(null);
    setForm({ username: "", password: "", displayName: "", permissions: [] });
    setDialog("create");
  }
  function openEdit(r: StaffRow) {
    setEditing(r);
    setForm({ username: r.username, password: "", displayName: r.displayName ?? "", permissions: r.permissionList });
    setDialog("edit");
  }

  function togglePerm(key: string) {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key) ? f.permissions.filter((k) => k !== key) : [...f.permissions, key],
    }));
  }

  async function submit() {
    setBusy(true);
    try {
      if (dialog === "create") {
        await apiPost("/api/admin/admin-users", form);
        toast.success("子账号已创建");
      } else if (editing) {
        await apiPatch("/api/admin/admin-users", {
          id: editing.id,
          displayName: form.displayName,
          permissions: form.permissions,
          ...(form.password ? { newPassword: form.password } : {}),
        });
        toast.success("已保存");
      }
      setDialog(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(r: StaffRow) {
    if (!await confirmDialog({ title: `确认${r.status === "ACTIVE" ? "禁用" : "启用"}「${r.username}」?禁用后立即无法登录`, destructive: true })) return;
    try {
      await apiPatch("/api/admin/admin-users", { id: r.id, status: r.status === "ACTIVE" ? "DISABLED" : "ACTIVE" });
      toast.success("已更新");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    }
  }

  async function remove(r: StaffRow) {
    if (!await confirmDialog({ title: `确认删除子账号「${r.username}」?该操作不可恢复(操作日志保留其姓名快照)`, destructive: true })) return;
    try {
      await apiDelete(`/api/admin/admin-users?id=${r.id}`);
      toast.success("已删除");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">子账号</h1>
          <p className="text-sm text-muted-foreground">
            子账号按预定义权限组访问后台;站点配置、注册用户、备份等敏感菜单为主账号专属
          </p>
        </div>
        <Button onClick={openCreate}>新建子账号</Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2">用户名</th>
                <th className="py-2">角色</th>
                <th className="py-2">权限组</th>
                <th className="py-2">状态</th>
                <th className="py-2">最近登录</th>
                <th className="py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="py-2.5">
                    <div className="font-medium">{r.displayName || r.username}</div>
                    <div className="text-xs text-muted-foreground">{r.username}</div>
                  </td>
                  <td className="py-2.5">
                    <Badge variant={r.role === "OWNER" ? "default" : "outline"}>
                      {r.role === "OWNER" ? "主账号" : "子账号"}
                    </Badge>
                  </td>
                  <td className="py-2.5">
                    {r.role === "OWNER" ? (
                      <span className="text-muted-foreground">全部</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {r.permissionList.length === 0 && <span className="text-muted-foreground">无</span>}
                        {r.permissionList.map((p) => (
                          <Badge key={p} variant="outline">
                            {GROUPS.find((g) => g.key === p)?.label ?? p}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5">
                    <Badge variant={r.status === "ACTIVE" ? "default" : "secondary"}>
                      {r.status === "ACTIVE" ? "启用" : "已禁用"}
                    </Badge>
                  </td>
                  <td className="py-2.5 text-muted-foreground">
                    {r.lastLoginAt ? new Date(r.lastLoginAt).toLocaleString() : "从未"}
                  </td>
                  <td className="py-2.5 text-right">
                    {r.role === "STAFF" && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                          编辑
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => toggleStatus(r)}>
                          {r.status === "ACTIVE" ? "禁用" : "启用"}
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(r)}>
                          删除
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {(rows ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    暂无账号数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={!!dialog} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialog === "create" ? "新建子账号" : "编辑子账号"}</DialogTitle>
            <DialogDescription>
              勾选权限组后,子账号侧栏仅显示对应菜单;站点配置等敏感菜单不可授权
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {dialog === "create" && (
              <>
                <div className="space-y-1.5">
                  <Label>用户名(登录用)</Label>
                  <Input
                    placeholder="小写字母/数字,2~32 位"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>初始密码(至少 8 位)</Label>
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                </div>
              </>
            )}
            {dialog === "edit" && (
              <div className="space-y-1.5">
                <Label>重置密码(留空=不修改)</Label>
                <Input
                  type="password"
                  placeholder="至少 8 位"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>显示名</Label>
              <Input
                placeholder="如:运营小李"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>权限组</Label>
              {GROUPS.map((g) => (
                <div key={g.key} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="text-sm font-medium">{g.label}</div>
                  </div>
                  <Switch
                    checked={form.permissions.includes(g.key)}
                    onCheckedChange={() => togglePerm(g.key)}
                  />
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                数据看板、站点配置、注册用户、商店设置、备份、子账号、操作日志为主账号专属
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialog(null)}>
                取消
              </Button>
              <Button onClick={submit} disabled={busy}>
                {busy ? "保存中…" : "保存"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
