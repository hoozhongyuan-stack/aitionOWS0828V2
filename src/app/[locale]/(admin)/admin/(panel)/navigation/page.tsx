"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet, apiPut, apiDelete } from "@/components/admin/api-client";
import { Plus, Pencil, Trash2, CornerDownRight, EyeOff } from "lucide-react";

/**
 * 导航管理(需求 4.4):新增/删除/排序/隐藏,支持关联栏目或自定义链接、
 * 多语言文案(labelI18n)、新窗口打开、二级菜单。
 */

interface NavItem {
  id: number;
  parentId: number | null;
  categoryId: number | null;
  label: string;
  labelI18n: string | null;
  url: string | null;
  sort: number;
  visible: boolean;
  target: string;
}
interface Category {
  id: number;
  slug: string;
  translations: { locale: string; name: string }[];
}

const EMPTY = {
  id: undefined as number | undefined,
  parentId: null as number | null,
  mode: "category" as "category" | "url",
  categoryId: null as number | null,
  url: "",
  labels: {} as Record<string, string>,
  sort: 0,
  visible: true,
  newTab: false,
};

export default function NavigationAdminPage() {
  const [items, setItems] = useState<NavItem[] | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [locales, setLocales] = useState<string[]>(["zh-CN", "en"]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    apiGet<NavItem[]>("/api/admin/nav")
      .then(setItems)
      .catch((e) => toast.error(e.message));
  }, []);

  useEffect(() => {
    load();
    apiGet<Category[]>("/api/admin/categories").then(setCats).catch(() => {});
    apiGet<{ locales: { code: string }[] }>("/api/admin/locales")
      .then((d) => setLocales(d.locales.map((l) => l.code)))
      .catch(() => {});
  }, [load]);

  function openNew(parentId: number | null = null) {
    setForm({ ...EMPTY, parentId, sort: (items?.length ?? 0) * 10 });
    setOpen(true);
  }

  function openEdit(item: NavItem) {
    let labels: Record<string, string> = {};
    try {
      labels = item.labelI18n ? JSON.parse(item.labelI18n) : {};
    } catch {
      /* 忽略 */
    }
    if (!Object.keys(labels).length && item.label) labels[locales[0]] = item.label;
    setForm({
      id: item.id,
      parentId: item.parentId,
      mode: item.categoryId ? "category" : "url",
      categoryId: item.categoryId,
      url: item.url ?? "",
      labels,
      sort: item.sort,
      visible: item.visible,
      newTab: item.target === "_blank",
    });
    setOpen(true);
  }

  async function save() {
    const fallbackLabel =
      form.labels[locales[0]] ||
      Object.values(form.labels).find(Boolean) ||
      cats.find((c) => c.id === form.categoryId)?.translations[0]?.name ||
      "";
    setSaving(true);
    try {
      await apiPut("/api/admin/nav", {
        id: form.id,
        parentId: form.parentId,
        categoryId: form.mode === "category" ? form.categoryId : null,
        label: fallbackLabel,
        labelI18n: JSON.stringify(form.labels),
        url: form.mode === "url" ? form.url : null,
        sort: form.sort,
        visible: form.visible,
        target: form.newTab ? "_blank" : "_self",
      });
      toast.success("已保存,前台导航即时更新");
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: NavItem) {
    if (!window.confirm("确认删除该导航项(子项一并删除)?")) return;
    try {
      await apiDelete(`/api/admin/nav?id=${item.id}`);
      toast.success("已删除");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  if (!items) return <div className="text-sm text-muted-foreground">加载中…</div>;

  const roots = items.filter((i) => !i.parentId);
  const rows: { item: NavItem; depth: number }[] = [];
  for (const r of roots) {
    rows.push({ item: r, depth: 0 });
    for (const c of items.filter((i) => i.parentId === r.id)) rows.push({ item: c, depth: 1 });
  }
  const catName = (id: number | null) =>
    id == null ? "-" : (cats.find((c) => c.id === id)?.translations[0]?.name ?? `#${id}`);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">导航管理</h1>
          <p className="text-sm text-muted-foreground">前台页头菜单;可关联栏目或任意链接,支持二级菜单。</p>
        </div>
        <Button onClick={() => openNew()}>
          <Plus className="h-4 w-4" /> 新建导航
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>文案</TableHead>
            <TableHead>指向</TableHead>
            <TableHead>排序</TableHead>
            <TableHead>状态</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                还没有导航项;不配置时前台仅展示 LOGO
              </TableCell>
            </TableRow>
          )}
          {rows.map(({ item, depth }) => (
            <TableRow key={item.id}>
              <TableCell>
                <span className="flex items-center gap-1">
                  {depth > 0 && <CornerDownRight className="h-3 w-3 text-muted-foreground" />}
                  {(() => {
                    try {
                      const m = item.labelI18n ? JSON.parse(item.labelI18n) : {};
                      return m[locales[0]] || item.label;
                    } catch {
                      return item.label;
                    }
                  })()}
                  {item.target === "_blank" && <Badge variant="outline">新窗口</Badge>}
                </span>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {item.categoryId ? `栏目:${catName(item.categoryId)}` : item.url}
              </TableCell>
              <TableCell>{item.sort}</TableCell>
              <TableCell>
                {item.visible ? (
                  <Badge variant="outline">显示</Badge>
                ) : (
                  <Badge variant="secondary">
                    <EyeOff className="mr-1 h-3 w-3" />
                    隐藏
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                {depth === 0 && (
                  <Button variant="ghost" size="sm" onClick={() => openNew(item.id)} title="新建子菜单">
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => remove(item)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "编辑导航" : "新建导航"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>指向类型</Label>
                <Select
                  value={form.mode}
                  onValueChange={(v) => setForm({ ...form, mode: v as "category" | "url" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="category">关联栏目</SelectItem>
                    <SelectItem value="url">自定义链接</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.mode === "category" ? (
                <div className="space-y-2">
                  <Label>选择栏目</Label>
                  <Select
                    value={form.categoryId ? String(form.categoryId) : ""}
                    onValueChange={(v) => setForm({ ...form, categoryId: Number(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="请选择栏目" />
                    </SelectTrigger>
                    <SelectContent>
                      {cats.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.translations[0]?.name ?? c.slug}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>链接地址</Label>
                  <Input
                    value={form.url}
                    onChange={(e) => setForm({ ...form, url: e.target.value })}
                    placeholder="/contact 或 https://…"
                  />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>菜单文案(留空时关联栏目自动使用栏目名)</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {locales.map((l) => (
                  <Input
                    key={l}
                    value={form.labels[l] ?? ""}
                    onChange={(e) => setForm({ ...form, labels: { ...form.labels, [l]: e.target.value } })}
                    placeholder={l}
                  />
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>排序</Label>
                <Input
                  type="number"
                  value={String(form.sort)}
                  onChange={(e) => setForm({ ...form, sort: Number(e.target.value) || 0 })}
                />
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <Switch checked={form.visible} onCheckedChange={(c) => setForm({ ...form, visible: c })} />
                前台显示
              </label>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <Switch checked={form.newTab} onCheckedChange={(c) => setForm({ ...form, newTab: c })} />
                新窗口打开
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
