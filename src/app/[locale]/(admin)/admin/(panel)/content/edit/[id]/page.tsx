"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CURRENCIES } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { UploadField } from "@/components/admin/upload-field";
import { apiGet, apiPut } from "@/components/admin/api-client";
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2 } from "lucide-react";

/**
 * 内容编辑器(需求 4.4 / V3.0 REQ-001 / V3.1 REQ-001):
 * - 基础:标识/栏目/封面/状态(草稿/发布/下架/定时)
 * - 多语言 Tab:标题/摘要/富文本正文 + 单页 TDK(需求 4.1)
 * - 商品栏目(moduleType=product):图集多图上传(通用,存主表)+
 *   规格参数键值行(V3.1 起移入语言 Tab,每语言独立编辑、全量往返提交 translations[].specs;
 *   默认语言 Tab 保存时同步写顶层 specs 兜底列)+ 收藏数只读展示
 *   (收藏数与阅读/赞/转对称:仅只读展示,不提供编辑入口)
 */

interface Translation {
  locale: string;
  title: string;
  summary: string;
  body: string;
  seoTitle: string;
  seoKeywords: string;
  seoDesc: string;
  specs: SpecRow[];
}
interface Category {
  id: number;
  moduleType: string;
  translations: { locale: string; name: string }[];
}
interface SpecRow {
  k: string;
  v: string;
}

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "草稿(不对外)" },
  { value: "PUBLISHED", label: "立即发布" },
  { value: "SCHEDULED", label: "定时发布" },
  { value: "OFFLINE", label: "下架" },
];

function emptyTranslation(locale: string): Translation {
  return {
    locale,
    title: "",
    summary: "",
    body: "",
    seoTitle: "",
    seoKeywords: "",
    seoDesc: "",
    specs: [],
  };
}

/** 解析图集 JSON 串(容错:非法/缺失返回空数组,不抛错) */
function parseGalleryJson(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** 解析规格参数 JSON 串(容错:非法/缺失返回空数组,不抛错) */
function parseSpecsJson(raw: string | null | undefined): SpecRow[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (x): x is SpecRow =>
          !!x && typeof x === "object" && typeof x.k === "string" && typeof x.v === "string"
      )
      .map((r) => ({ k: r.k, v: r.v }));
  } catch {
    return [];
  }
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
  const [forms, setForms] = useState<{ id: number; name: string; enabled: boolean }[]>([]);
  const [formId, setFormId] = useState<number | null>(null); // 挂载到详情页底部的表单(可选)
  const [slug, setSlug] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [status, setStatus] = useState("DRAFT");
  const [authorName, setAuthorName] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [publishAt, setPublishAt] = useState("");
  const [trans, setTrans] = useState<Record<string, Translation>>({});
  // —— 商品扩展字段(仅 product 栏目展示与提交)——
  // gallery 存主表跨语言通用;specs(V3.1)按语言存 ContentTranslation.specs,
  // 每语言 Tab 独立编辑、全量往返提交,默认语言 Tab 保存时同步写顶层 specs 兜底列
  const [gallery, setGallery] = useState<string[]>([]);
  // 价格/币种(V4.0):价格留空=仅询盘(提交 null 清除);仅商品栏目展示
  const [priceInput, setPriceInput] = useState("");
  const [currencyInput, setCurrencyInput] = useState("USD");
  const [defaultLocale, setDefaultLocale] = useState("zh-CN"); // 默认语言 Tab(顶层兜底列同步源)
  const [favoriteCount, setFavoriteCount] = useState(0); // 只读展示,与阅读/赞/转对称
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [locData, catData, formData] = await Promise.all([
          apiGet<{ locales: { code: string; isDefault?: boolean }[] }>("/api/admin/locales"),
          apiGet<Category[]>("/api/admin/categories"),
          apiGet<{ id: number; name: string; enabled: boolean }[]>("/api/admin/forms"),
        ]);
        const codes = locData.locales.map((l) => l.code);
        setLocales(codes);
        const def = locData.locales.find((l) => l.isDefault)?.code ?? codes[0] ?? "zh-CN";
        setDefaultLocale(def);
        setCats(catData);
        setForms(formData);

        if (!isNew) {
          const c = await apiGet<{
            slug: string;
            categoryId: number;
            status: string;
            authorName: string | null;
            coverUrl: string | null;
            publishAt: string | null;
            formId: number | null;
            gallery: string | null;
            specs: string | null;
            priceCents: number | null;
            currency: string | null;
            favoriteCount: number;
            translations: (Partial<Translation> & { specs?: SpecRow[] | null })[];
          }>(`/api/admin/contents?id=${id}`);
          setSlug(c.slug);
          setCategoryId(c.categoryId);
          setFormId(c.formId ?? null);
          setStatus(c.status === "PENDING" || c.status === "REJECTED" ? c.status : c.status);
          setAuthorName(c.authorName ?? "");
          setCoverUrl(c.coverUrl ?? "");
          setPublishAt(c.publishAt ? toLocalInput(new Date(c.publishAt)) : "");
          setGallery(parseGalleryJson(c.gallery)); // 保存后重开即回显(AC-001)
          setFavoriteCount(c.favoriteCount ?? 0);
          setPriceInput(c.priceCents != null ? String(c.priceCents / 100) : "");
          setCurrencyInput(c.currency || "USD");
          // 顶层 specs 兜底列(GET 返回 JSON 串):默认语言 Tab 回显的兜底来源
          const mainRows = parseSpecsJson(c.specs);
          const map: Record<string, Translation> = {};
          for (const code of codes) {
            const t = c.translations.find((x) => x.locale === code);
            // 各语言 specs 回显(V3.1):服务层已解析为数组;NULL/缺失 → 空编辑器。
            // 默认语言 Tab 空时回显顶层兜底列(保持「默认语言 Tab=顶层 specs」一致语义)
            const rows = Array.isArray(t?.specs) ? (t!.specs as SpecRow[]) : [];
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
              specs: rows.length > 0 || code !== def ? rows : mainRows,
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
      // 规格参数行规整(去首尾空格、丢弃键值不全的空行);默认语言 Tab 为顶层兜底列同步源
      const cleanSpecs = (rows: SpecRow[]) =>
        rows.map((r) => ({ k: r.k.trim(), v: r.v.trim() })).filter((r) => r.k && r.v);
      const defaultRows = cleanSpecs(trans[defaultLocale]?.specs ?? []);
      await apiPut("/api/admin/contents", {
        id: isNew ? undefined : Number(id),
        slug,
        categoryId,
        formId: formId ?? null,
        status: st === "PENDING" || st === "REJECTED" ? "DRAFT" : st,
        authorName: authorName.trim(),
        coverUrl: coverUrl || null,
        publishAt: st === "SCHEDULED" && publishAt ? new Date(publishAt).toISOString() : null,
        // 商品字段:仅商品栏目提交(切回 article 栏目时不传,服务层保留既有值)。
        // specs=默认语言 Tab 同步顶层兜底列;translations[].specs=各语言 Tab 全量往返(V3.1 REQ-001)
        ...(isProduct
          ? {
              gallery: gallery.map((u) => u.trim()).filter(Boolean),
              specs: defaultRows,
              // 价格:留空=仅询盘(存 null);填写时以「元」输入换算整数分
              price: {
                priceCents: priceInput.trim() === "" ? null : Math.round(Number(priceInput) * 100),
                currency: currencyInput,
              },
            }
          : {}),
        translations: Object.values(trans).map((t) => ({
          locale: t.locale,
          title: t.title,
          summary: t.summary || null,
          body: t.body,
          seoTitle: t.seoTitle || null,
          seoKeywords: t.seoKeywords || null,
          seoDesc: t.seoDesc || null,
          ...(isProduct ? { specs: cleanSpecs(t.specs ?? []) } : {}),
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

  // 所选栏目为商品栏目时,展示并提交图集/规格参数(AC-001:article 编辑页不出现该区域)
  const isProduct = cats.find((c) => c.id === categoryId)?.moduleType === "product";

  /** 图集行:更新/上移/下移/删除(保持有序,保存时过滤空行) */
  const updateGalleryAt = (idx: number, url: string) =>
    setGallery(gallery.map((u, i) => (i === idx ? url : u)));
  const moveGallery = (idx: number, dir: -1 | 1) => {
    const next = [...gallery];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setGallery(next);
  };
  const updateSpecAt = (loc: string, idx: number, patch: Partial<SpecRow>) =>
    setT(loc, {
      specs: (trans[loc]?.specs ?? []).map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    });
  const removeSpecAt = (loc: string, idx: number) =>
    setT(loc, { specs: (trans[loc]?.specs ?? []).filter((_, i) => i !== idx) });
  const addSpec = (loc: string) =>
    setT(loc, { specs: [...(trans[loc]?.specs ?? []), { k: "", v: "" }] });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
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
            <Label>内容标识(URL:{isProduct ? "/product" : "/article"}/{slug || "标识"})</Label>
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
            <Label>所属表单(可选,挂载到文章详情页底部)</Label>
            <Select
              value={formId ? String(formId) : "none"}
              onValueChange={(v) => setFormId(v === "none" ? null : Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="不挂载" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">不挂载</SelectItem>
                {forms
                  .filter((f) => f.enabled)
                  .map((f) => (
                    <SelectItem key={f.id} value={String(f.id)}>
                      {f.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
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
              <Input
                type="datetime-local"
                value={publishAt}
                onChange={(e) => setPublishAt(e.target.value)}
              />
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

      {/* 商品信息(仅 product 栏目):图集/收藏数(REQ-001);规格参数已移入语言 Tab(V3.1) */}
      {isProduct && (
        <Card>
          <CardHeader>
            <CardTitle>商品信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
              <div className="space-y-2">
                <Label>价格(留空 = 仅询盘)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="如 199.00"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>币种</Label>
                <Select value={currencyInput} onValueChange={setCurrencyInput}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground sm:pb-2">
                填写价格后前台显示「加入购物车」;留空则仅展示询盘表单
              </p>
            </div>
            <div className="space-y-2">
              <Label>
                商品图集(有序,最多 20 张;跨语言通用,详情页按此顺序展示,封面图仅在图集为空时兜底)
              </Label>
              {gallery.length === 0 && (
                <p className="text-xs text-muted-foreground">暂无图集,点击下方按钮添加图片</p>
              )}
              <div className="space-y-3">
                {gallery.map((url, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <div className="flex-1">
                      <UploadField
                        value={url}
                        onChange={(u) => updateGalleryAt(idx, u)}
                        label={`图集第 ${idx + 1} 张`}
                        hint="JPG/PNG/WebP,≤3MB"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="上移"
                      disabled={idx === 0}
                      onClick={() => moveGallery(idx, -1)}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="下移"
                      disabled={idx === gallery.length - 1}
                      onClick={() => moveGallery(idx, 1)}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="删除"
                      onClick={() => setGallery(gallery.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={gallery.length >= 20}
                onClick={() => setGallery([...gallery, ""])}
              >
                <Plus className="h-4 w-4" /> 添加图片
              </Button>
            </div>

            <div className="space-y-1">
              <Label>收藏数(只读,随用户收藏行为自动增减)</Label>
              <Input value={String(favoriteCount)} readOnly disabled className="w-24" />
              <p className="text-xs text-muted-foreground">
                与阅读/点赞/转发一致:互动统计仅展示,后台不可修改。
              </p>
            </div>
          </CardContent>
        </Card>
      )}

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
                  <Input
                    value={trans[l]?.title ?? ""}
                    onChange={(e) => setT(l, { title: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>摘要(列表卡片展示)</Label>
                  <Textarea
                    value={trans[l]?.summary ?? ""}
                    onChange={(e) => setT(l, { summary: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>正文</Label>
                  <RichTextEditor
                    value={trans[l]?.body ?? ""}
                    onChange={(html) => setT(l, { body: html })}
                  />
                </div>
              </CardContent>
            </Card>
            {/* 规格参数(V3.1 REQ-001):移入语言 Tab,每语言独立维护;
                默认语言 Tab 保存时同步写顶层 specs 兜底列 */}
            {isProduct && (
              <Card>
                <CardHeader>
                  <CardTitle>
                    规格参数({l}){l === defaultLocale ? " · 同步顶层兜底列" : ""}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Label>有序键值对,最多 50 行;键与值均必填;详情页按当前语言兜底链展示</Label>
                  <div className="space-y-2">
                    {(trans[l]?.specs ?? []).map((row, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          placeholder="参数名(如:型号)"
                          value={row.k}
                          onChange={(e) => updateSpecAt(l, idx, { k: e.target.value })}
                          className="w-44"
                        />
                        <Input
                          placeholder="参数值(如:AX-100)"
                          value={row.v}
                          onChange={(e) => updateSpecAt(l, idx, { v: e.target.value })}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="删除参数"
                          onClick={() => removeSpecAt(l, idx)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={(trans[l]?.specs ?? []).length >= 50}
                    onClick={() => addSpec(l)}
                  >
                    <Plus className="h-4 w-4" /> 添加参数
                  </Button>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader>
                <CardTitle>单页 SEO(TDK,{l})</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="space-y-2">
                  <Label>SEO 标题(留空使用内容标题)</Label>
                  <Input
                    value={trans[l]?.seoTitle ?? ""}
                    onChange={(e) => setT(l, { seoTitle: e.target.value })}
                  />
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
                  <Textarea
                    value={trans[l]?.seoDesc ?? ""}
                    onChange={(e) => setT(l, { seoDesc: e.target.value })}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
