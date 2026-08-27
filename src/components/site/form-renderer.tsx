"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FormField } from "@/types/form";
import { CheckCircle2 } from "lucide-react";

/**
 * 前台动态表单渲染器(需求 4.5):
 * 按后台构建器输出的字段结构渲染;文件字段先传 /api/upload 再随表单提交 URL。
 * 前端做基础校验,服务端全量复验。
 */
export function FormRenderer({
  slug,
  title,
  fields,
}: {
  slug: string;
  title: string;
  fields: FormField[];
}) {
  const t = useTranslations("form");
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const set = (id: string, v: unknown) => setValues({ ...values, [id]: v });

  async function uploadFile(field: FormField, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("purpose", "form");
    const r = await fetch("/api/upload", { method: "POST", body: fd });
    const d = await r.json();
    if (!r.ok || d.ok === false) throw new Error(d.message || "文件上传失败");
    set(field.id, d.data.url);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // 前端必填校验(服务端还会复验)
    for (const f of fields) {
      const v = values[f.id];
      const empty = v == null || v === "" || (Array.isArray(v) && v.length === 0);
      if (f.required && empty) {
        toast.error(`「${f.label}」${t("required")}`);
        return;
      }
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/form/${slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: values }),
      });
      const d = await r.json();
      if (!r.ok || d.ok === false) throw new Error(d.message || t("submitFailed"));
      setDone(true);
      toast.success(t("submitSuccess"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("submitFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-10 text-center">
        <CheckCircle2 className="h-10 w-10 text-primary" />
        <p className="text-lg font-medium">{t("submitSuccess")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-xl border bg-card p-6 sm:p-8">
      <h2 className="font-heading text-xl font-semibold">{title}</h2>
      {fields.map((f) => (
        <div key={f.id} className="space-y-2">
          <Label>
            {f.label}
            {f.required && <span className="ml-0.5 text-destructive">*</span>}
          </Label>

          {f.type === "text" && (
            <Input
              value={String(values[f.id] ?? "")}
              onChange={(e) => set(f.id, e.target.value)}
              placeholder={f.placeholder}
            />
          )}
          {f.type === "textarea" && (
            <Textarea
              value={String(values[f.id] ?? "")}
              onChange={(e) => set(f.id, e.target.value)}
              placeholder={f.placeholder}
              rows={4}
            />
          )}
          {f.type === "date" && (
            <Input type="date" value={String(values[f.id] ?? "")} onChange={(e) => set(f.id, e.target.value)} />
          )}
          {f.type === "select" && (
            <Select value={String(values[f.id] ?? "")} onValueChange={(v) => set(f.id, v)}>
              <SelectTrigger>
                <SelectValue placeholder={f.placeholder || t("selectPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {(f.options ?? []).map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {f.type === "radio" && (
            <div className="flex flex-wrap gap-4">
              {(f.options ?? []).map((o) => (
                <label key={o} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={f.id}
                    checked={values[f.id] === o}
                    onChange={() => set(f.id, o)}
                    className="h-4 w-4 accent-current"
                  />
                  {o}
                </label>
              ))}
            </div>
          )}
          {f.type === "checkbox" && (
            <div className="flex flex-wrap gap-4">
              {(f.options ?? []).map((o) => {
                const arr = Array.isArray(values[f.id]) ? (values[f.id] as string[]) : [];
                return (
                  <label key={o} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={arr.includes(o)}
                      onCheckedChange={(c) => set(f.id, c ? [...arr, o] : arr.filter((x) => x !== o))}
                    />
                    {o}
                  </label>
                );
              })}
            </div>
          )}
          {f.type === "file" && (
            <div className="space-y-1">
              <Input
                type="file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadFile(f, file).catch((err) => toast.error(err.message));
                }}
              />
              {typeof values[f.id] === "string" && (values[f.id] as string).startsWith("/uploads/") && (
                <p className="text-xs text-muted-foreground">已上传 ✓</p>
              )}
            </div>
          )}
        </div>
      ))}
      <Button type="submit" disabled={busy} className="w-full sm:w-auto">
        {busy ? "…" : t("submit") ?? "提交"}
      </Button>
    </form>
  );
}
