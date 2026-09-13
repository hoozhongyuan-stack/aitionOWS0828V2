"use client";
import { useRouter } from "next/navigation";
import { TablePagination } from "@/components/admin/table-pagination";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/admin/dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet, apiPost } from "@/components/admin/api-client";
import { useBatchSelection } from "@/components/admin/use-batch-selection";
import { BatchActionBar, runBatchAction } from "@/components/admin/batch-action-bar";
import { Ban, CheckCircle2, Pencil } from "lucide-react";

/**
 * 注册用户管理(需求 4.6 / V3.0 REQ-009):
 * - 查看/搜索(邮箱/昵称 + 公司名称模糊搜索)/禁用/启用
 * - 「编辑资料」弹窗:公司名称/国家/省/市,全可选自由文本,PATCH 保存后刷新回显
 * - 批量启用/禁用(V4.4.0):POST /api/admin/users/batch。**有意不提供批量删除** ——
 *   用户连带订单/评论/收藏/投稿数据,删除保持单个操作 + 二次确认。
 */

interface UserRow {
  id: number;
  email: string | null;
  nickname: string | null;
  wechatOpenId: string | null;
  status: string;
  createdAt: string;
  companyName: string | null;
  country: string | null;
  province: string | null;
  city: string | null;
  _count: { comments: number };
  orderCount: number; // 名下订单数(V4.0.2)
}
/** 地区文本(国家 · 省 · 市,缺项自动跳过;全空返回空串) */
function regionText(u: Pick<UserRow, "country" | "province" | "city">): string {
  return [u.country, u.province, u.city].filter((v): v is string => !!v && v.trim() !== "").join(" · ");
}

interface ListData {
  total: number;
  page: number;
  pageSize: number;
  items: UserRow[];
}

/** PATCH 请求(资料编辑专用;api-client 暂无 apiPatch) */
async function apiPatch<T = unknown>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: T; message?: string };
  if (!res.ok || data.ok === false) throw new Error(data.message || `请求失败(${res.status})`);
  return data.data as T;
}

/** 编辑弹窗的表单状态(4 字段全可选,空串提交即清空) */
interface ProfileForm {
  companyName: string;
  country: string;
  province: string;
  city: string;
}

const EMPTY_PROFILE: ProfileForm = { companyName: "", country: "", province: "", city: "" };

export default function UsersAdminPage() {
  const router = useRouter();
  const [data, setData] = useState<ListData | null>(null);
  const [keyword, setKeyword] = useState("");
  const [company, setCompany] = useState("");
  const [appliedCompany, setAppliedCompany] = useState(""); // 回车/点按钮才生效的搜索词
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10); // V4.0.2:默认 10,可 50/100
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [profile, setProfile] = useState<ProfileForm>(EMPTY_PROFILE);
  const [saving, setSaving] = useState(false);
  // 批量选择(V4.4.0):翻页/改搜索词都会重新 load,load 内统一清空,避免"选中了看不见的项"
  const batch = useBatchSelection<UserRow>();
  const clearBatch = batch.clear; // 引用稳定(内部 useCallback),可安全放进 load 依赖

  const load = useCallback(() => {
    clearBatch();
    const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (keyword) q.set("keyword", keyword);
    if (appliedCompany) q.set("q", appliedCompany);
    apiGet<ListData>(`/api/admin/users?${q}`)
      .then(setData)
      .catch((e) => toast.error(e.message));
  }, [page, pageSize, keyword, appliedCompany, clearBatch]);

  useEffect(load, [load]);

  async function toggle(user: UserRow) {
    const next = user.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    if (next === "DISABLED" && !await confirmDialog({ title: `确认禁用用户「${user.nickname || user.email}」?禁用后立即无法登录`, destructive: true }))
      return;
    try {
      await apiPost("/api/admin/users", { id: user.id, status: next });
      toast.success(next === "DISABLED" ? "已禁用" : "已启用");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    }
  }

  /** 批量启用/禁用:结果摘要由服务端算好,失败项原因在 summary 里 */
  async function doBatch(action: "enable" | "disable") {
    // 批量禁用影响面大(一次最多 100 个账号,且禁用后对方立即无法登录),与单个禁用一样先确认
    if (action === "disable" && !await confirmDialog({ title: `确认禁用选中的 ${batch.count} 位用户?禁用后他们将无法登录`, destructive: true })) return;
    try {
      const summary = await runBatchAction("/api/admin/users/batch", Array.from(batch.selected), action);
      toast.success(summary);
      batch.clear();
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "批量操作失败");
    }
  }

  function openEdit(user: UserRow) {
    setEditing(user);
    setProfile({
      companyName: user.companyName ?? "",
      country: user.country ?? "",
      province: user.province ?? "",
      city: user.city ?? "",
    });
  }

  async function saveProfile() {
    if (!editing || saving) return;
    setSaving(true);
    try {
      await apiPatch("/api/admin/users", {
        id: editing.id,
        companyName: profile.companyName.trim(),
        country: profile.country.trim(),
        province: profile.province.trim(),
        city: profile.city.trim(),
      });
      toast.success("资料已保存");
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setSaving(false);
    }
  }


  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">注册用户</h1>
        <p className="text-sm text-muted-foreground">共 {data?.total ?? "…"} 位用户;禁用后其会话与评论/投稿权限即刻失效。</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value);
            setPage(1);
          }}
          placeholder="搜索邮箱 / 昵称…"
          className="w-64"
        />
        {/* 公司名称模糊搜索(REQ-009):回车或点击按钮提交 */}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setAppliedCompany(company.trim());
          }}
        >
          <Input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="搜索公司名称…"
            className="w-64"
          />
          <Button type="submit" variant="outline" size="sm">
            搜索
          </Button>
          {appliedCompany && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setCompany("");
                setAppliedCompany("");
                setPage(1);
              }}
            >
              清除
            </Button>
          )}
        </form>
      </div>

      <BatchActionBar count={batch.count} onClear={batch.clear}>
        <Button size="sm" variant="outline" onClick={() => doBatch("enable")}>
          批量启用
        </Button>
        <Button size="sm" variant="outline" onClick={() => doBatch("disable")}>
          批量禁用
        </Button>
      </BatchActionBar>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary align-middle"
                checked={batch.allSelected(data?.items ?? [])}
                ref={(el) => {
                  if (el) el.indeterminate = batch.someSelected(data?.items ?? []);
                }}
                onChange={() => batch.toggleAll(data?.items ?? [])}
                aria-label="全选本页"
              />
            </TableHead>
            <TableHead>用户</TableHead>
            <TableHead>登录方式</TableHead>
            <TableHead>资料</TableHead>
            <TableHead>评论数</TableHead>
            <TableHead>订单数</TableHead>
            <TableHead>注册时间</TableHead>
            <TableHead>状态</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                暂无注册用户
              </TableCell>
            </TableRow>
          )}
          {data?.items.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="w-10">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary align-middle"
                  checked={batch.selected.has(u.id)}
                  onChange={() => batch.toggle(u.id)}
                  aria-label="选择此项"
                />
              </TableCell>
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
              {/* 资料列(V4.6.7):公司名称 + 地区两行 —— 此前只有公司名称一列,后台填的
                  国家/省/市在列表里无处可见;缺项自动跳过,全空显示 - */}
              <TableCell className="text-sm">
                <div className="max-w-56 truncate" title={u.companyName ?? undefined}>
                  {u.companyName || <span className="text-muted-foreground">-</span>}
                </div>
                {regionText(u) ? (
                  <div className="max-w-56 truncate text-xs text-muted-foreground" title={regionText(u)}>
                    {regionText(u)}
                  </div>
                ) : null}
              </TableCell>
              <TableCell>{u._count.comments}</TableCell>
              <TableCell>
                {u.orderCount > 0 ? (
                  <button
                    type="button"
                    className="underline-offset-2 hover:text-primary hover:underline"
                    title="查看该用户订单"
                    onClick={() => router.push(`/zh-CN/admin/orders?q=${encodeURIComponent(u.email || "")}`)}
                  >
                    {u.orderCount}
                  </button>
                ) : (
                  <span className="text-muted-foreground">0</span>
                )}
              </TableCell>
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
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>
                    <Pencil className="h-4 w-4" /> 编辑资料
                  </Button>
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
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <TablePagination
        total={data?.total ?? 0}
        page={page}
        pageSize={pageSize}
        onPage={(p) => setPage(p)}
        onPageSize={(n) => {
          setPageSize(n);
          setPage(1);
        }}
      />

      {/* 编辑资料弹窗(REQ-009):公司名称/国家/省/市,全部可留空 */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>编辑用户资料</DialogTitle>
            <DialogDescription>
              {editing ? `${editing.nickname || editing.email || `用户${editing.id}`} 的公司/地区资料(前台不可见,均可留空)` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {(
              [
                ["companyName", "公司名称"],
                ["country", "国家"],
                ["province", "省"],
                ["city", "市"],
              ] as const
            ).map(([field, label]) => (
              <div key={field} className="space-y-2">
                <Label htmlFor={`profile-${field}`}>{label}</Label>
                <Input
                  id={`profile-${field}`}
                  value={profile[field]}
                  maxLength={100}
                  onChange={(e) => setProfile((p) => ({ ...p, [field]: e.target.value }))}
                  placeholder={`填写${label}(可选)`}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              取消
            </Button>
            <Button onClick={saveProfile} disabled={saving}>
              {saving ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
