"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { UploadField } from "@/components/admin/upload-field";
import { apiGet, apiPut } from "@/components/admin/api-client";
import { ArrowLeft } from "lucide-react";

/**
 * 内容编辑器(需求 4.4):
 * - 基础:标识/栏目/封面/状态(草稿/发布/下架/定时)
 * - 多语言 Tab:标题/摘要/富文本正文 + 单页 TDK(需求 4.1)
 */

interface Translation {
  locale: string;
  title: string;
  summary: string;
  body: string;
  seoTitle: string;
  seoKeywords: string;
  seoDesc: string;
}
interface Category {
  id: number;
  translations: { locale: string; name: string }[];
}

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "草稿(不对外)" },
  { value: "PUBLISHED", label: "立即发布" },
  { value: "SCHEDULED", label: "定时发布" },
  { value: "OFFLINE", label: "下架" },
];

function emptyTranslation(locale: string): Translation {
  return { locale, title: "", summary: "", body: "", seoTitle: "", seoKeywords: "", seoDesc: "" };
}

/** 把 Date 转 datetime-local 输入格式(本地时区) */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ContentEditPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const locale = useLocale();
  const router = useRouter();

  const [locales, setLocales] = useState<string[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [slug, setSlug] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [status, setStatus] = useState("DRAFT");
  const [authorName, setAuthorName] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [publishAt, setPublishAt] = useState("");
  const [trans, setTrans] = useState<Record<string, Translation>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [locData, catData] = await Promise.all([
          apiGet<{ locales: { code: string }[] }>("/api/admin/locales"),
          apiGet<Category[]>("/api/admin/categories"),
        ]);
        const codes = locData.locales.map((l) => l.code);
        setLocales(codes);
        setCats(catData);

        if (!isNew) {
          const c = await apiGet<{
            slug: string;
            categoryId: number;
            status: string;
            authorName: string | null;
            coverUrl: string | null;
            publishAt: string | null;
            translations: Partial<Translation>[];
          }>(`/api/admin/contents?id=${id}`);
          setSlug(c.slug);
          setCategoryId(c.categoryId);
          setStatus(c.status === "PENDING" || c.status === "REJECTED" ? c.status : c.status);
          setAuthorName(c.authorName ?? "");
          setCoverUrl(c.coverUrl ?? "");
          setPublishAt(c.publishAt ? toLocalInput(new Date(c.publishAt)) : "");
          const map: Record<string, Translation> = {};
          for (const code of codes) {
            const t = c.translations.find((x) => x.locale === code);
            map[code] = {
              ...emptyTranslation(code),
              ...(t
                ? {
                    title: t.title ?? "",
                    summary: t.summary ?? "",
                    body: t.body ?? "",
                    seoTitle: t.seoTitle ?? "",
                    seoKeywords: t.seoKeywords ?? "",
                    seoDesc: t.seoDesc ?? "",
                  }
                : {}),
            };
          }
          setTrans(map);
        } else {
          setSlug(`post-${Date.now().toString(36)}`);
          setTrans(Object.fromEntries(codes.map((c) => [c, emptyTranslation(c)])));
          if (catData[0]) setCategoryId(catData[0].id);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "加载失败");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isNew]);

  async function save(overrideStatus?: string) {
    if (!categoryId) {
      toast.error("请选择栏目(可先到「栏目管理」创建)");
      return;
    }
    if (!authorName.trim()) {
      toast.error("请填写作者");
      return;
    }
    const st = overrideStatus ?? status;
    setSaving(true);
    try {
      await apiPut("/api/admin/contents", {
        id: isNew ? undefined : Number(id),
        slug,
        categoryId,
        status: st === "PENDING" || st === "REJECTED" ? "DRAFT" : st,
        authorName: authorName.trim(),
        coverUrl: coverUrl || null,
        publishAt: st === "SCHEDULED" && publishAt ? new Date(publishAt).toISOString() : null,
        translations: Object.values(trans).map((t) => ({
          locale: t.locale,
          title: t.title,
          summary: t.summary || null,
          body: t.body,
          seoTitle: t.seoTitle || null,
          seoKeywords: t.seoKeywords || null,
          seoDesc: t.seoDesc || null,
        })),
      });
      toast.success("已保存");
      router.push(`/${locale}/admin/content`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
      setSaving(false);
    }
  }

  if (loading) return <div className="text-sm text-muted-foreground">加载中…</div>;

  const setT = (code: string, patch: Partial<Translation>) =>
    setTrans({ ...trans, [code]: { ...trans[code], ...patch } });

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-semibold">{isNew ? "新建内容" : "编辑内容"}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => save("DRAFT")} disabled={saving}>
            存草稿
          </Button>
          <Button onClick={() => save()} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>基础信息</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>内容标识(URL:/article/标识)</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
          </div>
          <div className="space-y-2">
            <Label>所属栏目</Label>
            <Select
              value={categoryId ? String(categoryId) : ""}
              onValueChange={(v) => setCategoryId(Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="请选择栏目" />
              </SelectTrigger>
              <SelectContent>
                {cats.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.translations[0]?.name ?? `#${c.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>作者(必填,展示在前台详情页)</Label>
            <Input
              placeholder="请输入作者名称"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>发布状态</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {status === "SCHEDULED" && (
            <div className="space-y-2">
              <Label>定时发布时间</Label>
              <Input type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} />
            </div>
          )}
          <div className="space-y-2 sm:col-span-2">
            <Label>封面图</Label>
            <UploadField
              value={coverUrl}
              onChange={setCoverUrl}
              label="封面图"
              hint="建议尺寸 1200×675px(16:9),JPG/PNG/WebP,≤3MB"
            />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue={locales[0]}>
        <TabsList>
          {locales.map((l) => (
            <TabsTrigger key={l} value={l}>
              {l}
              {trans[l]?.title ? "" : " ○"}
            </TabsTrigger>
          ))}
        </TabsList>
        {locales.map((l) => (
          <TabsContent key={l} value={l} className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>内容({l})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>标题</Label>
                  <Input value={trans[l]?.title ?? ""} onChange={(e) => setT(l, { title: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>摘要(列表卡片展示)</Label>
                  <Textarea value={trans[l]?.summary ?? ""} onChange={(e) => setT(l, { summary: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>正文</Label>
                  <RichTextEditor value={trans[l]?.body ?? ""} onChange={(html) => setT(l, { body: html })} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>单页 SEO(TDK,{l})</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="space-y-2">
                  <Label>SEO 标题(留空使用内容标题)</Label>
                  <Input value={trans[l]?.seoTitle ?? ""} onChange={(e) => setT(l, { seoTitle: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>SEO 关键词(逗号分隔)</Label>
                  <Input
                    value={trans[l]?.seoKeywords ?? ""}
                    onChange={(e) => setT(l, { seoKeywords: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>SEO 描述(留空使用摘要)</Label>
                  <Textarea value={trans[l]?.seoDesc ?? ""} onChange={(e) => setT(l, { seoDesc: e.target.value })} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
