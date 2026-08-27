"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { UploadField } from "@/components/admin/upload-field";
import { apiGet, apiPut } from "@/components/admin/api-client";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";

/**
 * 轮播图管理(新增需求①):
 * 首页顶部通屏轮播图,导航栏叠加在其上作为背景;最多 5 张,支持关联跳转链接(可选)。
 * 首页大标题/副标题(测试反馈:后台没有可维护的地方)直接在本页按语言编辑,
 * 底层复用「界面文案覆盖」的存储(namespace=site,key=heroTitle/heroSubtitle),
 * 只是把入口从隐晦的通用文案表挪到这里,和轮播图放在一起,构成完整的首页 Hero 配置。
 */

const MAX_BANNERS = 5;

interface BannerRow {
  imageUrl: string;
  linkUrl: string;
  enabled: boolean;
}

interface BannerDto {
  imageUrl: string;
  linkUrl: string | null;
  enabled: boolean;
}

interface UiTranslationRow {
  id: number;
  locale: string;
  namespace: string;
  key: string;
  value: string;
}

interface HeroText {
  heroTitle: string;
  heroSubtitle: string;
}

/** 模板出厂默认文案(仅用作占位提示,留空保存不会覆盖它) */
const HERO_PLACEHOLDER: Record<string, HeroText> = {
  "zh-CN": { heroTitle: "企业官网模板系统", heroSubtitle: "高度自定义 · 本地部署 · AI 检索友好" },
  en: {
    heroTitle: "Corporate Website Template System",
    heroSubtitle: "Highly customizable · Self-hosted · AI-search friendly",
  },
};

export default function BannersAdminPage() {
  const [items, setItems] = useState<BannerRow[] | null>(null);
  const [saving, setSaving] = useState(false);

  const [locales, setLocales] = useState<string[]>([]);
  const [heroTexts, setHeroTexts] = useState<Record<string, HeroText> | null>(null);
  const [savingHero, setSavingHero] = useState(false);

  useEffect(() => {
    apiGet<BannerDto[]>("/api/admin/banners")
      .then((rows) =>
        setItems(rows.map((r) => ({ imageUrl: r.imageUrl, linkUrl: r.linkUrl ?? "", enabled: r.enabled })))
      )
      .catch((e) => toast.error(e.message));
  }, []);

  useEffect(() => {
    apiGet<{ locales: { code: string; enabled: boolean }[] }>("/api/admin/locales")
      .then(async (d) => {
        const codes = d.locales.filter((l) => l.enabled).map((l) => l.code);
        setLocales(codes);
        const entries = await Promise.all(
          codes.map(async (code) => {
            const rows = await apiGet<UiTranslationRow[]>(`/api/admin/ui-translations?locale=${code}`);
            const find = (key: string) => rows.find((r) => r.namespace === "site" && r.key === key)?.value ?? "";
            return [code, { heroTitle: find("heroTitle"), heroSubtitle: find("heroSubtitle") }] as const;
          })
        );
        setHeroTexts(Object.fromEntries(entries));
      })
      .catch((e) => toast.error(e.message));
  }, []);

  function updateHero(locale: string, patch: Partial<HeroText>) {
    if (!heroTexts) return;
    setHeroTexts({
      ...heroTexts,
      [locale]: { ...(heroTexts[locale] ?? { heroTitle: "", heroSubtitle: "" }), ...patch },
    });
  }

  async function saveHero() {
    if (!heroTexts) return;
    setSavingHero(true);
    try {
      const rows = Object.entries(heroTexts).flatMap(([locale, t]) =>
        [
          { locale, namespace: "site", key: "heroTitle", value: t.heroTitle.trim() },
          { locale, namespace: "site", key: "heroSubtitle", value: t.heroSubtitle.trim() },
        ].filter((r) => r.value !== "")
      );
      await apiPut("/api/admin/ui-translations", { rows });
      toast.success("已保存,首页即时生效");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingHero(false);
    }
  }

  function update(i: number, patch: Partial<BannerRow>) {
    if (!items) return;
    const next = [...items];
    next[i] = { ...next[i], ...patch };
    setItems(next);
  }

  function move(i: number, dir: -1 | 1) {
    if (!items) return;
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
  }

  function remove(i: number) {
    if (!items) return;
    setItems(items.filter((_, idx) => idx !== i));
  }

  function add() {
    if (!items || items.length >= MAX_BANNERS) return;
    setItems([...items, { imageUrl: "", linkUrl: "", enabled: true }]);
  }

  async function save() {
    if (!items) return;
    if (items.some((it) => !it.imageUrl.trim())) {
      toast.error("每张轮播图都需要上传图片,或删除未上传的空行");
      return;
    }
    setSaving(true);
    try {
      await apiPut("/api/admin/banners", {
        items: items.map((it) => ({
          imageUrl: it.imageUrl,
          linkUrl: it.linkUrl.trim() || null,
          enabled: it.enabled,
        })),
      });
      toast.success("已保存,首页即时生效");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (!items) return <div className="text-sm text-muted-foreground">加载中…</div>;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">轮播图</h1>
        <p className="text-sm text-muted-foreground">
          首页顶部通屏轮播,顶部导航栏叠加在轮播图上方作为背景;最多 {MAX_BANNERS} 张,可选填跳转链接。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>首页文案</CardTitle>
          <CardDescription>
            首页顶部大标题、副标题,按语言分别维护;留空则显示模板默认文案(不会覆盖已保存的内容)。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!heroTexts && <div className="text-sm text-muted-foreground">加载中…</div>}
          {heroTexts &&
            locales.map((locale) => (
              <div key={locale} className="space-y-3 rounded-lg border p-4">
                <div className="text-sm font-medium text-muted-foreground">{locale}</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>首页大标题</Label>
                    <Input
                      placeholder={HERO_PLACEHOLDER[locale]?.heroTitle ?? ""}
                      value={heroTexts[locale]?.heroTitle ?? ""}
                      onChange={(e) => updateHero(locale, { heroTitle: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>首页副标题</Label>
                    <Input
                      placeholder={HERO_PLACEHOLDER[locale]?.heroSubtitle ?? ""}
                      value={heroTexts[locale]?.heroSubtitle ?? ""}
                      onChange={(e) => updateHero(locale, { heroSubtitle: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={saveHero} disabled={savingHero || !heroTexts}>
          {savingHero ? "保存中…" : "保存首页文案"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>轮播图列表</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.length === 0 && (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              还没有轮播图,首页顶部将展示默认渐变背景
            </div>
          )}
          {items.map((it, i) => (
            <div key={i} className="space-y-3 rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <Label>图片</Label>
                  <UploadField
                    value={it.imageUrl}
                    onChange={(url) => update(i, { imageUrl: url })}
                    label={`轮播图 ${i + 1}`}
                    hint="建议宽度 ≥1920px 的通栏横图(高度不限,实际按屏幕自动裁切填充,主体内容居中构图更保险),JPG/PNG/WebP,≤5MB"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(i)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>跳转链接(可选)</Label>
                  <Input
                    placeholder="https://…"
                    value={it.linkUrl}
                    onChange={(e) => update(i, { linkUrl: e.target.value })}
                  />
                </div>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <Switch checked={it.enabled} onCheckedChange={(c) => update(i, { enabled: c })} />
                  前台展示
                </label>
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={add} disabled={items.length >= MAX_BANNERS}>
            <Plus className="h-4 w-4" /> 添加轮播图({items.length}/{MAX_BANNERS})
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? "保存中…" : "保存"}
        </Button>
      </div>
    </div>
  );
}
