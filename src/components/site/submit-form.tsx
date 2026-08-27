"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RichTextEditor } from "@/components/admin/rich-text-editor";

/**
 * 用户投稿表单(需求 4.8):
 * 指定栏目 + 图文内容;上传走用户通道;提交后进入审核队列。
 */

async function userUpload(file: File): Promise<{ url: string }> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("purpose", "submission");
  const r = await fetch("/api/upload", { method: "POST", body: fd });
  const d = await r.json();
  if (!r.ok || d.ok === false) throw new Error(d.message || "上传失败");
  return { url: d.data.url };
}

export function SubmitForm({ categories }: { categories: { id: number; name: string }[] }) {
  const t = useTranslations("submission");
  const locale = useLocale();
  const router = useRouter();
  const [categoryId, setCategoryId] = useState<number | null>(categories[0]?.id ?? null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function pickCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const r = await userUpload(file);
      setCoverUrl(r.url);
      toast.success("封面已上传");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上传失败");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!categoryId) {
      toast.error("请选择投稿栏目");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/submission", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          categoryId,
          locale,
          title,
          summary: summary || null,
          body,
          coverUrl: coverUrl || null,
        }),
      });
      const d = await r.json();
      if (!r.ok || d.ok === false) throw new Error(d.message || "投稿失败");
      toast.success(t("success"));
      router.push(`/${locale}/submissions`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "投稿失败");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>{t("category")}</Label>
          <Select value={categoryId ? String(categoryId) : ""} onValueChange={(v) => setCategoryId(Number(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t("cover")}(可选)</Label>
          <div className="flex items-center gap-3">
            {coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverUrl} alt="封面预览" className="h-10 w-16 rounded border object-cover" />
            )}
            <Input type="file" accept="image/*" onChange={pickCover} className="max-w-60" />
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <Label>{t("contentTitle")}</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
      </div>
      <div className="space-y-2">
        <Label>{t("summary")}(可选)</Label>
        <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={500} rows={2} />
      </div>
      <div className="space-y-2">
        <Label>{t("body")}</Label>
        <RichTextEditor value={body} onChange={setBody} uploader={userUpload} minHeight={320} />
      </div>
      <div className="flex items-center justify-between">
        <Link href={`/${locale}/submissions`} className="text-sm text-primary underline underline-offset-2">
          {t("myList")}
        </Link>
        <Button type="submit" disabled={busy}>
          {busy ? "…" : t("submit")}
        </Button>
      </div>
    </form>
  );
}
