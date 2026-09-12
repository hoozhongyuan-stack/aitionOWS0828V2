"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/admin/dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiGet, apiPut, apiDelete } from "@/components/admin/api-client";
import { useBatchSelection } from "@/components/admin/use-batch-selection";
import { BatchActionBar, runBatchAction } from "@/components/admin/batch-action-bar";
import { routing } from "@/i18n/routing";

/** 后台列表显示名:优先站点默认语言(zh-CN),缺失回退首条翻译(修复后台显示英文) */
const DEFAULT_LOCALE = routing.defaultLocale;
function adminDisplayName(translations: { locale: string; name: string }[], slug: string) {
  return translations.find(t => t.locale === DEFAULT_LOCALE)?.name ?? translations[0]?.name ?? slug;
}
import { Plus, Pencil, Trash2, EyeOff, CornerDownRight } from "lucide-react";

/**
 * 栏目管理(需求 4.4):树形栏目 CRUD、排序、隐藏、模块类型、外链、投稿许可。
 */

interface CatTranslation {
  locale: string;
  name: string;
  description: string | null;
}
interface Category {
  id: number;
  slug: string;
  parentId: number | null;
  moduleType: string;
  sort: number;
  visible: boolean;
  externalUrl: string | null;
  allowSubmit: boolean;
  translations: CatTranslation[];
  _count: { contents: number; children: number };
}

const MODULE_TYPES = [
  { value: "article", label: "图文文章" },
  { value: "news", label: "新闻资讯" },
  { value: "product", label: "产品" },
  { value: "case", label: "案例" },
  { value: "page", label: "单页" },
];

const EMPTY_FORM = {
  id: undefined as number | undefined,
  slug: "",
  parentId: null as number | null,
  moduleType: "article",
  sort: 0,
  visible: true,
  externalUrl: "",
  allowSubmit: false,
  names: {} as Record<string, string>,
  descs: {} as Record<string, string>,
};

export default function CategoriesAdminPage() {
  const [cats, setCats] = useState<Category[] | null>(null);
  const [locales, setLocales] = useState<string[]>(["zh-CN", "en"]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  /** 批量选择:选中项以栏目 id 为单位 */
  const batch = useBatchSelection<Category>();
  // clear 由 hook 内 useCallback 固定,单独取出来做依赖以保持 load 稳定
  const { clear: clearBatch } = batch;

  /** 加载列表:顺带清空批量选择,避免残留已刷新/已不存在的选中项 */
  const load = useCallback(() => {
    clearBatch();
    apiGet<Category[]>("/api/admin/categories")
      .then(setCats)
      .catch((e) => toast.error(e.message));
  }, [clearBatch]);

  useEffect(() => {
    load();
    apiGet<{ locales: { code: string }[] }>("/api/admin/locales")
      .then((d) => setLocales(d.locales.map((l) => l.code)))
      .catch(() => {});
  }, [load]);

  function openNew(parentId: number | null = null) {
    setForm({ ...EMPTY_FORM, parentId, sort: (cats?.length ?? 0) * 10 });
    setOpen(true);
  }

  function openEdit(cat: Category) {
    setForm({
      id: cat.id,
      slug: cat.slug,
      parentId: cat.parentId,
      moduleType: cat.moduleType,
      sort: cat.sort,
      visible: cat.visible,
      externalUrl: cat.externalUrl ?? "",
      allowSubmit: cat.allowSubmit,
      names: Object.fromEntries(cat.translations.map((t) => [t.locale, t.name])),
      descs: Object.fromEntries(cat.translations.map((t) => [t.locale, t.description ?? ""])),
    });
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    try {
      await apiPut("/api/admin/categories", {
        id: form.id,
        slug: form.slug,
        parentId: form.parentId,
        moduleType: form.moduleType,
        sort: form.sort,
        visible: form.visible,
        externalUrl: form.externalUrl || null,
        allowSubmit: form.allowSubmit,
        translations: locales.map((l) => ({
          locale: l,
          name: form.names[l] ?? "",
          description: form.descs[l] || null,
        })),
      });
      toast.success("已保存");
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function remove(cat: Category) {
    if (!await confirmDialog({ title: `确认删除栏目「${adminDisplayName(cat.translations, cat.slug)}」?`, destructive: true })) return;
    try {
      await apiDelete(`/api/admin/categories?id=${cat.id}`);
      toast.success("已删除");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  /** 批量显示/隐藏/删除;删除前二次确认,结果摘要由服务端给出 */
  async function doBatch(action: string) {
    if (action === "delete" && !await confirmDialog({ title: `确认删除选中的 ${batch.count} 项?此操作不可恢复`, destructive: true })) return;
    try {
      const summary = await runBatchAction("/api/admin/categories/batch", Array.from(batch.selected), action);
      toast.success(summary);
      batch.clear();
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "批量操作失败");
    }
  }

  if (!cats) return <div className="text-sm text-muted-foreground">加载中…</div>;

  const roots = cats.filter((c) => !c.parentId);
  const childrenOf = (id: number) => cats.filter((c) => c.parentId === id);
  const rows: { cat: Category; depth: number }[] = [];
  for (const r of roots) {
    rows.push({ cat: r, depth: 0 });
    for (const c of childrenOf(r.id)) rows.push({ cat: c, depth: 1 });
  }
  /** 表格渲染的是 { cat, depth } 包装行,批量选择取其中的栏目本身 */
  const selectable = rows.map((r) => r.cat);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">栏目管理</h1>
          <p className="text-sm text-muted-foreground">栏目决定内容归属与前台列表页;可关联到导航。</p>
        </div>
        <Button onClick={() => openNew()}>
          <Plus className="h-4 w-4" /> 新建栏目
        </Button>
      </div>

      <BatchActionBar count={batch.count} onClear={batch.clear}>
        <Button size="sm" variant="outline" onClick={() => doBatch("show")}>
          批量显示
        </Button>
        <Button size="sm" variant="outline" onClick={() => doBatch("hide")}>
          批量隐藏
        </Button>
        <Button size="sm" variant="outline" onClick={() => doBatch("delete")}>
          批量删除
        </Button>
      </BatchActionBar>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary align-middle"
                checked={batch.allSelected(selectable)}
                ref={(el) => {
                  if (el) el.indeterminate = batch.someSelected(selectable);
                }}
                onChange={() => batch.toggleAll(selectable)}
                aria-label="全选本页"
              />
            </TableHead>
            <TableHead>栏目名</TableHead>
            <TableHead>标识</TableHead>
            <TableHead>类型</TableHead>
            <TableHead>排序</TableHead>
            <TableHead>内容数</TableHead>
            <TableHead>状态</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                还没有栏目,点击「新建栏目」开始
              </TableCell>
            </TableRow>
          )}
          {rows.map(({ cat, depth }) => (
            <TableRow key={cat.id}>
              <TableCell className="w-10">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary align-middle"
                  checked={batch.selected.has(cat.id)}
                  onChange={() => batch.toggle(cat.id)}
                  aria-label="选择此项"
                />
              </TableCell>
              <TableCell>
                <span className="flex items-center gap-1">
                  {depth > 0 && <CornerDownRight className="h-3 w-3 text-muted-foreground" />}
                  {adminDisplayName(cat.translations, cat.slug)}
                  {cat.allowSubmit && <Badge variant="secondary">可投稿</Badge>}
                </span>
              </TableCell>
              <TableCell className="font-mono text-xs">{cat.slug}</TableCell>
              <TableCell>{MODULE_TYPES.find((m) => m.value === cat.moduleType)?.label ?? cat.moduleType}</TableCell>
              <TableCell>{cat.sort}</TableCell>
              <TableCell>{cat._count.contents}</TableCell>
              <TableCell>
                {cat.visible ? (
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
                  <Button variant="ghost" size="sm" onClick={() => openNew(cat.id)} title="新建子栏目">
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => openEdit(cat)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => remove(cat)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "编辑栏目" : "新建栏目"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Tabs defaultValue={locales[0]}>
              <TabsList>
                {locales.map((l) => (
                  <TabsTrigger key={l} value={l}>
                    {l}
                  </TabsTrigger>
                ))}
              </TabsList>
              {locales.map((l) => (
                <TabsContent key={l} value={l} className="space-y-3">
                  <div className="space-y-2">
                    <Label>栏目名({l})</Label>
                    <Input
                      value={form.names[l] ?? ""}
                      onChange={(e) => setForm({ ...form, names: { ...form.names, [l]: e.target.value } })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>描述({l},可选,用于栏目页副标题与 SEO)</Label>
                    <Input
                      value={form.descs[l] ?? ""}
                      onChange={(e) => setForm({ ...form, descs: { ...form.descs, [l]: e.target.value } })}
                    />
                  </div>
                </TabsContent>
              ))}
            </Tabs>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>标识(URL 用,小写字母/数字/-)</Label>
                <Input
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
                  placeholder="news"
                />
              </div>
              <div className="space-y-2">
                <Label>模块类型</Label>
                <Select value={form.moduleType} onValueChange={(v) => setForm({ ...form, moduleType: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODULE_TYPES.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>排序(小的在前)</Label>
                <Input
                  type="number"
                  value={String(form.sort)}
                  onChange={(e) => setForm({ ...form, sort: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>自定义跳转链接(可选)</Label>
                <Input
                  value={form.externalUrl}
                  onChange={(e) => setForm({ ...form, externalUrl: e.target.value })}
                  placeholder="https://…(填写后点击栏目直接跳转)"
                />
              </div>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.visible} onCheckedChange={(c) => setForm({ ...form, visible: c })} />
                前台显示
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.allowSubmit} onCheckedChange={(c) => setForm({ ...form, allowSubmit: c })} />
                允许用户投稿
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
