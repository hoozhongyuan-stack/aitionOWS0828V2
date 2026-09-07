"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { apiGet, apiPut, apiDelete } from "@/components/admin/api-client";
import { Trash2, Plus } from "lucide-react";

/**
 * 语言管理(需求 4.2 多语言系统):
 * 1) 语言列表:启用/默认/排序(默认语言决定裸域跳转)
 * 2) 界面文案:DB 覆盖静态文案(文件兜底),支持点路径 key
 * 3) 用户协议:注册协议/隐私政策 按语言富文本编辑(需求 4.6)
 */

interface LocaleRow {
  code: string;
  name: string;
  isDefault: boolean;
  enabled: boolean;
  sort: number;
}

function LocalesTab() {
  const [rows, setRows] = useState<LocaleRow[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet<{ locales: LocaleRow[] }>("/api/admin/locales")
      .then((d) => setRows(d.locales))
      .catch((e) => toast.error(e.message));
  }, []);

  async function save() {
    if (!rows) return;
    setSaving(true);
    try {
      await apiPut("/api/admin/locales", { locales: rows });
      toast.success("已保存,即时生效");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (!rows) return <div className="text-sm text-muted-foreground">加载中…</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>语言列表</CardTitle>
        <CardDescription>勾选前台展示语言并指定默认语言;新增语言需在模板 messages/ 中登记后出现在此处</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>语言代码</TableHead>
              <TableHead>显示名</TableHead>
              <TableHead>启用</TableHead>
              <TableHead>默认</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.code}>
                <TableCell className="font-mono text-xs">{r.code}</TableCell>
                <TableCell>
                  <Input
                    value={r.name}
                    onChange={(e) => {
                      const next = [...rows];
                      next[i] = { ...r, name: e.target.value };
                      setRows(next);
                    }}
                    className="h-8 w-40"
                  />
                </TableCell>
                <TableCell>
                  <Switch
                    checked={r.enabled}
                    onCheckedChange={(c) => {
                      const next = [...rows];
                      next[i] = { ...r, enabled: c, isDefault: c ? r.isDefault : false };
                      setRows(next);
                    }}
                  />
                </TableCell>
                <TableCell>
                  <input
                    type="radio"
                    name="defaultLocale"
                    checked={r.isDefault}
                    disabled={!r.enabled}
                    onChange={() => setRows(rows.map((x, j) => ({ ...x, isDefault: j === i })))}
                    className="h-4 w-4 accent-current"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface TransRow {
  id?: number;
  locale: string;
  namespace: string;
  key: string;
  value: string;
}

function TranslationsTab({ locales }: { locales: string[] }) {
  const [locale, setLocale] = useState(locales[0] ?? "zh-CN");
  const [rows, setRows] = useState<TransRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<TransRow[]>(`/api/admin/ui-translations?locale=${locale}`)
      .then(setRows)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [locale]);

  useEffect(load, [load]);

  async function save() {
    const bad = rows.find((r) => !r.namespace || !r.key);
    if (bad) {
      toast.error("命名空间与键不能为空");
      return;
    }
    setSaving(true);
    try {
      await apiPut("/api/admin/ui-translations", { rows: rows.map((r) => ({ ...r, locale })) });
      toast.success("已保存,即时生效");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: TransRow, index: number) {
    if (row.id) {
      try {
        await apiDelete(`/api/admin/ui-translations?id=${row.id}`);
        toast.success("已删除(恢复默认文案)");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "删除失败");
        return;
      }
    }
    setRows(rows.filter((_, i) => i !== index));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>界面文案覆盖</CardTitle>
        <CardDescription>
          覆盖模板内置静态文案。命名空间/键对应 messages 文件结构,常用示例——首页大标题:
          site + heroTitle;首页副标题(截图中“高度自定义·本地部署·AI 检索友好”就是它):
          site + heroSubtitle;首页按钮文案:site + heroCta。按需为每种语言分别填写。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Label>语言</Label>
          <Select value={locale} onValueChange={setLocale}>
            <SelectTrigger className="w-40">
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
        {loading ? (
          <div className="text-sm text-muted-foreground">加载中…</div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">命名空间</TableHead>
                  <TableHead className="w-48">键(支持点路径)</TableHead>
                  <TableHead>文案</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={r.id ?? `new-${i}`}>
                    <TableCell>
                      <Input
                        value={r.namespace}
                        onChange={(e) => {
                          const next = [...rows];
                          next[i] = { ...r, namespace: e.target.value };
                          setRows(next);
                        }}
                        className="h-8"
                        placeholder="site"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={r.key}
                        onChange={(e) => {
                          const next = [...rows];
                          next[i] = { ...r, key: e.target.value };
                          setRows(next);
                        }}
                        className="h-8"
                        placeholder="heroTitle"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={r.value}
                        onChange={(e) => {
                          const next = [...rows];
                          next[i] = { ...r, value: e.target.value };
                          setRows(next);
                        }}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => remove(r, i)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRows([...rows, { locale, namespace: "", key: "", value: "" }])}
              >
                <Plus className="h-4 w-4" /> 添加文案
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? "保存中…" : "保存"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AgreementsTab({ locales }: { locales: string[] }) {
  const [type, setType] = useState<"REGISTER" | "PRIVACY" | "COOKIES">("REGISTER");
  const [locale, setLocale] = useState(locales[0] ?? "zh-CN");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiGet<{ title: string; body: string }>(`/api/admin/agreements?type=${type}&locale=${locale}`)
      .then((d) => {
        setTitle(d.title || (type === "REGISTER" ? "用户注册协议" : type === "COOKIES" ? "Cookie 政策" : "隐私政策"));
        setBody(d.body || "");
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [type, locale]);

  async function save() {
    setSaving(true);
    try {
      await apiPut("/api/admin/agreements", { type, locale, title, body });
      toast.success("已保存,前台实时同步");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>用户协议</CardTitle>
        <CardDescription>注册协议与隐私政策,前台注册页与页脚实时展示</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={type} onValueChange={(v) => setType(v as "REGISTER" | "PRIVACY" | "COOKIES")}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="REGISTER">用户注册协议</SelectItem>
              <SelectItem value="PRIVACY">隐私政策</SelectItem>
              <SelectItem value="COOKIES">Cookie 政策</SelectItem>
            </SelectContent>
          </Select>
          <Select value={locale} onValueChange={setLocale}>
            <SelectTrigger className="w-32">
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
        {loading ? (
          <div className="text-sm text-muted-foreground">加载中…</div>
        ) : (
          <>
            <div className="space-y-2">
              <Label>协议标题</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>协议内容</Label>
              <RichTextEditor value={body} onChange={setBody} minHeight={320} />
            </div>
            <div className="flex justify-end">
              <Button onClick={save} disabled={saving}>
                {saving ? "保存中…" : "保存"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function I18nAdminPage() {
  const [locales, setLocales] = useState<string[]>([]);
  useEffect(() => {
    apiGet<{ locales: LocaleRow[] }>("/api/admin/locales")
      .then((d) => setLocales(d.locales.map((l) => l.code)))
      .catch(() => setLocales(["zh-CN", "en"]));
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">语言管理</h1>
        <p className="text-sm text-muted-foreground">多语言启用、界面文案与协议文本。</p>
      </div>
      <Tabs defaultValue="locales">
        <TabsList>
          <TabsTrigger value="locales">语言列表</TabsTrigger>
          <TabsTrigger value="translations">界面文案</TabsTrigger>
          <TabsTrigger value="agreements">用户协议</TabsTrigger>
        </TabsList>
        <TabsContent value="locales">
          <LocalesTab />
        </TabsContent>
        <TabsContent value="translations">
          <TranslationsTab locales={locales} />
        </TabsContent>
        <TabsContent value="agreements">
          <AgreementsTab locales={locales} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
