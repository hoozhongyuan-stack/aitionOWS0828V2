"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiGet, apiPut, apiDelete } from "@/components/admin/api-client";
import { Plus, Pencil, Trash2 } from "lucide-react";

/**
 * SEO / GEO 配置(需求 4.1):
 * - GEO 地理信息(城市/地址/经纬度/服务范围/地域关键词)→ 注入结构化数据
 * - robots 抓取开关与额外屏蔽路径
 * 单页 TDK 在各内容/栏目编辑处配置;固定页 TDK 见「页面 TDK」卡片(P4 批次接入)。
 */

type Dict = Record<string, unknown>;

export default function SeoPage() {
  const [v, setV] = useState<Dict | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet<Dict>("/api/admin/settings/seo")
      .then(setV)
      .catch((e) => toast.error(e.message));
  }, []);

  async function save() {
    if (!v) return;
    setSaving(true);
    try {
      await apiPut("/api/admin/settings/seo", { values: v });
      toast.success("已保存,即时生效");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (!v) return <div className="text-sm text-muted-foreground">加载中…</div>;
  const setS = (k: string, val: unknown) => setV({ ...v, [k]: val });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">SEO / GEO</h1>
        <p className="text-sm text-muted-foreground">
          地理信息注入结构化数据,提升本地检索与 AI 展示效果。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>GEO 地理信息</CardTitle>
          <CardDescription>用于企业结构化数据(JSON-LD)与地域关键词优化</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>所在城市</Label>
            <Input
              value={String(v.city ?? "")}
              onChange={(e) => setS("city", e.target.value)}
              placeholder="例:上海"
            />
          </div>
          <div className="space-y-2">
            <Label>详细地址</Label>
            <Input
              value={String(v.address ?? "")}
              onChange={(e) => setS("address", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>纬度(lat)</Label>
            <Input
              value={String(v.lat ?? "")}
              onChange={(e) => setS("lat", e.target.value)}
              placeholder="31.2304"
            />
          </div>
          <div className="space-y-2">
            <Label>经度(lng)</Label>
            <Input
              value={String(v.lng ?? "")}
              onChange={(e) => setS("lng", e.target.value)}
              placeholder="121.4737"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>服务范围</Label>
            <Input
              value={String(v.serviceArea ?? "")}
              onChange={(e) => setS("serviceArea", e.target.value)}
              placeholder="例:上海及长三角地区"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>地域关键词(逗号分隔)</Label>
            <Textarea
              value={String(v.geoKeywords ?? "")}
              onChange={(e) => setS("geoKeywords", e.target.value)}
              placeholder="例:上海网站建设,浦东企业官网,长三角数字化服务"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>搜索引擎抓取</CardTitle>
          <CardDescription>robots.txt 即时生成</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">允许搜索引擎收录</div>
              <div className="text-xs text-muted-foreground">
                关闭后 robots.txt 将禁止全站抓取(慎用)
              </div>
            </div>
            <Switch checked={!!v.allowIndex} onCheckedChange={(c) => setS("allowIndex", c)} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">允许 AI 检索引擎抓取(GEO)</div>
              <div className="text-xs text-muted-foreground">
                关闭后 robots.txt 将禁止 GPTBot/PerplexityBot 等主流 AI 爬虫
              </div>
            </div>
            <Switch
              checked={v.aiCrawlAllow !== false}
              onCheckedChange={(c) => setS("aiCrawlAllow", c)}
            />
          </div>
          <div className="space-y-2">
            <Label>额外屏蔽路径(每行一条,如 /private)</Label>
            <Textarea
              value={String(v.extraDisallow ?? "")}
              onChange={(e) => setS("extraDisallow", e.target.value)}
              placeholder={"/tmp\n/draft"}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? "保存中…" : "保存"}
        </Button>
      </div>

      <SeoMetaManager />
    </div>
  );
}

// ============ 固定页 TDK 管理(首页/联系页等,需求 4.1 单页 TDK)============

interface SeoMetaRow {
  id: number;
  pageKey: string;
  locale: string;
  title: string;
  keywords: string;
  description: string;
}

const PAGE_KEY_PRESETS = [
  { value: "home", label: "首页(home)" },
  { value: "contact", label: "联系页(contact)" },
  { value: "login", label: "登录页(login)" },
  { value: "register", label: "注册页(register)" },
];

function SeoMetaManager() {
  const [rows, setRows] = useState<SeoMetaRow[]>([]);
  const [locales, setLocales] = useState<string[]>(["zh-CN", "en"]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    pageKey: "home",
    locale: "zh-CN",
    title: "",
    keywords: "",
    description: "",
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    apiGet<SeoMetaRow[]>("/api/admin/seo-meta")
      .then(setRows)
      .catch((e) => toast.error(e.message));
  }, []);

  useEffect(() => {
    load();
    apiGet<{ locales: { code: string }[] }>("/api/admin/locales")
      .then((d) => setLocales(d.locales.map((l) => l.code)))
      .catch(() => {});
  }, [load]);

  async function save() {
    setSaving(true);
    try {
      await apiPut("/api/admin/seo-meta", form);
      toast.success("已保存,即时生效");
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: SeoMetaRow) {
    try {
      await apiDelete(`/api/admin/seo-meta?id=${row.id}`);
      toast.success("已删除");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>固定页 TDK</CardTitle>
          <CardDescription>
            首页、联系页等固定页面的标题/关键词/描述(内容与栏目在各自编辑处配置)
          </CardDescription>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setForm({
              pageKey: "home",
              locale: locales[0] ?? "zh-CN",
              title: "",
              keywords: "",
              description: "",
            });
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> 添加
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>页面</TableHead>
              <TableHead>语言</TableHead>
              <TableHead>标题</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                  未配置时使用站点默认标题
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.pageKey}</TableCell>
                <TableCell className="font-mono text-xs">{r.locale}</TableCell>
                <TableCell className="max-w-64 truncate">{r.title}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setForm({
                        pageKey: r.pageKey,
                        locale: r.locale,
                        title: r.title,
                        keywords: r.keywords,
                        description: r.description,
                      });
                      setOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(r)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>页面 TDK</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>页面标识</Label>
                <Select
                  value={form.pageKey}
                  onValueChange={(v) => setForm({ ...form, pageKey: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_KEY_PRESETS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>语言</Label>
                <Select value={form.locale} onValueChange={(v) => setForm({ ...form, locale: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {locales.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>标题(Title)</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>关键词(Keywords,逗号分隔)</Label>
              <Input
                value={form.keywords}
                onChange={(e) => setForm({ ...form, keywords: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>描述(Description)</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
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
    </Card>
  );
}
