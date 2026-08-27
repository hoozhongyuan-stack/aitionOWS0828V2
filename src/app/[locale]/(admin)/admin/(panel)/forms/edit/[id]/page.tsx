"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, apiPut } from "@/components/admin/api-client";
import type { FormField, FieldType } from "@/types/form";
import { ArrowLeft, ArrowUp, ArrowDown, Trash2, Plus } from "lucide-react";

/**
 * 表单构建器(需求 4.5):
 * 字段增删/上下排序/属性配置(字段名/必填/提示/选项/正则校验)。
 */

const TYPE_LABEL: Record<FieldType, string> = {
  text: "单行输入",
  textarea: "多行输入",
  radio: "单选",
  checkbox: "多选",
  select: "下拉选择",
  date: "日期",
  file: "文件上传",
};

const PATTERN_PRESETS = [
  { label: "无", value: "" },
  { label: "手机号", value: "^1[3-9]\\d{9}$" },
  { label: "邮箱", value: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$" },
];

function newField(type: FieldType): FormField {
  return {
    id: `f_${Math.random().toString(36).slice(2, 8)}`,
    type,
    label: TYPE_LABEL[type],
    placeholder: "",
    required: false,
    options: ["radio", "checkbox", "select"].includes(type) ? ["选项一", "选项二"] : undefined,
  };
}

export default function FormEditPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const locale = useLocale();
  const router = useRouter();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [relatedKey, setRelatedKey] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [antiDuplicate, setAntiDuplicate] = useState(true);
  const [fields, setFields] = useState<FormField[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) {
      setSlug(`form-${Date.now().toString(36)}`);
      setFields([
        { ...newField("text"), label: "姓名", required: true },
        { ...newField("text"), label: "联系电话", required: true, pattern: "^1[3-9]\\d{9}$", patternMsg: "手机号格式不正确" },
        { ...newField("textarea"), label: "咨询内容" },
      ]);
      return;
    }
    apiGet<{ name: string; slug: string; schema: string; relatedKey: string | null; enabled: boolean; antiDuplicate: boolean }>(
      `/api/admin/forms?id=${id}`
    )
      .then((f) => {
        setName(f.name);
        setSlug(f.slug);
        setRelatedKey(f.relatedKey ?? "");
        setEnabled(f.enabled);
        setAntiDuplicate(f.antiDuplicate);
        try {
          setFields(JSON.parse(f.schema));
        } catch {
          setFields([]);
        }
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    setFields(next);
  }

  const setF = (i: number, patch: Partial<FormField>) => {
    const next = [...fields];
    next[i] = { ...next[i], ...patch };
    setFields(next);
  };

  async function save() {
    if (!name.trim()) {
      toast.error("请输入表单名称");
      return;
    }
    setSaving(true);
    try {
      await apiPut("/api/admin/forms", {
        id: isNew ? undefined : Number(id),
        name,
        slug,
        fields,
        relatedKey: relatedKey || null,
        antiDuplicate,
        enabled,
      });
      toast.success("已保存,前台即时生效");
      router.push(`/${locale}/admin/forms`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
      setSaving(false);
    }
  }

  if (loading) return <div className="text-sm text-muted-foreground">加载中…</div>;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-semibold">{isNew ? "新建表单" : "编辑表单"}</h1>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? "保存中…" : "保存"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>基础设置</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>表单名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="在线咨询" />
          </div>
          <div className="space-y-2">
            <Label>标识(接口用)</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
          </div>
          <div className="space-y-2">
            <Label>关联标识(contact=联系页;栏目标识=该栏目页底部)</Label>
            <Input value={relatedKey} onChange={(e) => setRelatedKey(e.target.value)} placeholder="contact" />
          </div>
          <div className="flex items-end gap-6 pb-1">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={enabled} onCheckedChange={setEnabled} />
              启用
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={antiDuplicate} onCheckedChange={setAntiDuplicate} />
              防重复提交
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>字段配置({fields.length})</CardTitle>
          <div className="flex flex-wrap gap-1">
            {(Object.keys(TYPE_LABEL) as FieldType[]).map((t) => (
              <Button key={t} variant="outline" size="sm" onClick={() => setFields([...fields, newField(t)])}>
                <Plus className="h-3 w-3" />
                {TYPE_LABEL[t]}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {fields.length === 0 && (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              点击右上角按钮添加字段
            </div>
          )}
          {fields.map((f, i) => (
            <div key={f.id} className="rounded-lg border p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="rounded bg-muted px-2 py-0.5 text-xs">{TYPE_LABEL[f.type]}</span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => move(i, -1)} disabled={i === 0}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => move(i, 1)} disabled={i === fields.length - 1}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setFields(fields.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">字段名</Label>
                  <Input value={f.label} onChange={(e) => setF(i, { label: e.target.value })} className="h-8" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">提示文案(placeholder)</Label>
                  <Input
                    value={f.placeholder ?? ""}
                    onChange={(e) => setF(i, { placeholder: e.target.value })}
                    className="h-8"
                  />
                </div>
                {f.options && (
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">选项(每行一个)</Label>
                    <Textarea
                      value={f.options.join("\n")}
                      onChange={(e) => setF(i, { options: e.target.value.split("\n").filter((s) => s.trim()) })}
                      rows={3}
                    />
                  </div>
                )}
                {(f.type === "text" || f.type === "textarea") && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs">格式校验</Label>
                      <Select
                        value={PATTERN_PRESETS.some((p) => p.value === (f.pattern ?? "")) ? (f.pattern ?? "") : "custom"}
                        onValueChange={(v) => setF(i, { pattern: v === "custom" ? f.pattern : v || undefined })}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PATTERN_PRESETS.map((p) => (
                            <SelectItem key={p.label} value={p.value}>
                              {p.label}
                            </SelectItem>
                          ))}
                          <SelectItem value="custom">自定义正则</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">自定义正则 / 错误提示</Label>
                      <div className="flex gap-2">
                        <Input
                          value={f.pattern ?? ""}
                          onChange={(e) => setF(i, { pattern: e.target.value || undefined })}
                          className="h-8 font-mono text-xs"
                          placeholder="^…$"
                        />
                        <Input
                          value={f.patternMsg ?? ""}
                          onChange={(e) => setF(i, { patternMsg: e.target.value || undefined })}
                          className="h-8"
                          placeholder="格式不正确"
                        />
                      </div>
                    </div>
                  </>
                )}
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={f.required} onCheckedChange={(c) => setF(i, { required: c })} />
                  必填
                </label>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
