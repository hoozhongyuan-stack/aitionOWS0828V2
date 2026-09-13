"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { apiGet, apiPut } from "@/components/admin/api-client";
import { AdminSelect } from "@/components/admin/admin-select";

/**
 * V3.2 页面布局配置(方案 A · 轻量):
 * 首页布局预设(3 套)+ 区块显隐;栏目页布局预设(2 套)。
 * V3.3 D 首页楼层:逐层绑定栏目+样式+条数,上移/下移排序;未配置=现状布局零变化。
 * 保存即生效(Setting group=layout;缺省=现状布局)。
 */
interface Floor {
  categoryId: number;
  style: "grid3" | "list" | "feature";
  limit: number;
  title?: string;
  visible: boolean;
}
interface LayoutValues {
  home: { preset: string; sections: { banners: boolean; latest: boolean } };
  category: { preset: string; sections: { header: boolean } };
  floors: Floor[];
}
interface CategoryOption {
  id: number;
  slug: string;
  name: string;
}

const HOME_PRESETS = [
  { key: "grid", label: "网格(默认)", desc: "轮播 Hero + 最新动态网格,现状布局" },
  { key: "hero-list", label: "大图列表", desc: "全宽 Hero + 最新动态列表条目 + CTA 横幅" },
  { key: "split", label: "分屏", desc: "左右分屏 Hero + 最新动态网格" },
  { key: "spotlight", label: "全幅聚焦", desc: "V4.2.1 新增:全幅首屏(撑满一屏)+ 超大标题 + 双按钮,品牌形象站推荐" },
];
const CATEGORY_PRESETS = [
  { key: "list", label: "网格(默认)", desc: "头图 + 卡片网格 + 分页,现状布局" },
  { key: "magazine", label: "杂志", desc: "首条大图特写 + 其余双列 + 侧栏" },
];
const FLOOR_STYLES = [
  { key: "grid3", label: "三列卡片" },
  { key: "list", label: "紧凑列表" },
  { key: "feature", label: "大图特写" },
];
const FLOOR_MAX = 8;

export default function PageLayoutPage() {
  const [values, setValues] = useState<LayoutValues | null>(null);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<CategoryOption[]>([]);

  useEffect(() => {
    apiGet<LayoutValues>("/api/admin/settings/layout")
      .then((v) =>
        setValues({
          home: {
            preset: v.home?.preset ?? "grid",
            sections: {
              banners: v.home?.sections?.banners ?? true,
              latest: v.home?.sections?.latest ?? true,
            },
          },
          category: {
            preset: v.category?.preset ?? "list",
            sections: { header: v.category?.sections?.header ?? true },
          },
          floors: Array.isArray(v.floors) ? v.floors : [],
        })
      )
      .catch(() => toast.error("布局配置加载失败"));
    // 栏目下拉选项(楼层绑定用);名称按中文优先,与后台界面语言一致
    apiGet<{ id: number; slug: string; translations: { locale: string; name: string }[] }[]>(
      "/api/admin/categories"
    )
      .then((cats) =>
        setCategories(
          (cats ?? []).map((c) => ({
            id: c.id,
            slug: c.slug,
            name: c.translations?.find((t) => t.locale === "zh-CN")?.name ?? c.translations?.[0]?.name ?? c.slug,
          }))
        )
      )
      .catch(() => toast.error("栏目列表加载失败"));
  }, []);

  if (!values) return <div className="text-sm text-muted-foreground">加载中…</div>;

  // —— 楼层操作(V3.3 D) ——
  function updateFloor(i: number, patch: Partial<Floor>) {
    setValues({
      ...values!,
      floors: values!.floors.map((f, j) => (j === i ? { ...f, ...patch } : f)),
    });
  }
  function moveFloor(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= values!.floors.length) return;
    const next = [...values!.floors];
    [next[i], next[j]] = [next[j], next[i]];
    setValues({ ...values!, floors: next });
  }
  function addFloor() {
    if (values!.floors.length >= FLOOR_MAX) {
      toast.error(`最多 ${FLOOR_MAX} 个楼层`);
      return;
    }
    const firstUnused = categories.find((c) => !values!.floors.some((f) => f.categoryId === c.id));
    if (!firstUnused) {
      toast.error("没有可绑定的栏目");
      return;
    }
    setValues({
      ...values!,
      floors: [...values!.floors, { categoryId: firstUnused.id, style: "grid3", limit: 6, visible: true }],
    });
  }

  async function save() {
    setSaving(true);
    try {
      await apiPut("/api/admin/settings/layout", { values });
      toast.success("已保存,前台布局立即生效");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">页面布局</h1>
        <p className="text-sm text-muted-foreground">
          前台布局预设与区块显隐(V3.2);保存后前台立即生效,可随主题风格自由组合。
        </p>
      </div>

      {/* 首页 */}
      <Card>
        <CardHeader>
          <CardTitle>首页布局</CardTitle>
          <CardDescription>三种预设排布;区块可显隐(数据不删)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {HOME_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setValues({ ...values, home: { ...values.home, preset: p.key } })}
                className={`rounded-xl border-2 p-4 text-left transition-colors ${
                  values.home.preset === p.key ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"
                }`}
              >
                <div className="font-semibold">{p.label}</div>
                <p className="mt-1 text-xs text-muted-foreground">{p.desc}</p>
              </button>
            ))}
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="font-medium">轮播图区块</div>
                <p className="text-xs text-muted-foreground">首页顶部轮播(需后台已配置轮播图)</p>
              </div>
              <Switch
                checked={values.home.sections.banners}
                onCheckedChange={(v) => setValues({ ...values, home: { ...values.home, sections: { ...values.home.sections, banners: v } } })}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="font-medium">最新动态区块</div>
                <p className="text-xs text-muted-foreground">最新已发布内容网格</p>
              </div>
              <Switch
                checked={values.home.sections.latest}
                onCheckedChange={(v) => setValues({ ...values, home: { ...values.home, sections: { ...values.home.sections, latest: v } } })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 首页楼层(V3.3 D) */}
      <Card>
        <CardHeader>
          <CardTitle>首页楼层</CardTitle>
          <CardDescription>
            逐层绑定栏目,在「最新动态」之后按顺序渲染;未配置=现状布局。引用已删栏目或无内容的楼层自动跳过。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {values.floors.length === 0 && (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              暂无楼层,点击下方「添加楼层」按栏目配置首页内容区块
            </p>
          )}
          {values.floors.map((f, i) => {
            const cat = categories.find((c) => c.id === f.categoryId);
            return (
              <div key={`${f.categoryId}-${i}`} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-12 text-sm font-medium text-muted-foreground">第 {i + 1} 层</span>
                  <AdminSelect
                    className="w-44"
                    size="sm"
                    value={String(f.categoryId)}
                    aria-label="楼层栏目"
                    onChange={(v) => updateFloor(i, { categoryId: Number(v) })}
                    options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
                  />
                  <AdminSelect
                    className="w-28"
                    size="sm"
                    value={f.style}
                    aria-label="楼层样式"
                    onChange={(v) => updateFloor(i, { style: v as Floor["style"] })}
                    options={FLOOR_STYLES.map((s) => ({ value: s.key, label: s.label }))}
                  />
                  <label className="flex items-center gap-1 text-sm text-muted-foreground">
                    条数
                    <input
                      type="number"
                      min={1}
                      max={12}
                      className="w-16 rounded-md border bg-background px-2 py-1 text-sm"
                      value={f.limit}
                      onChange={(e) => updateFloor(i, { limit: Math.min(12, Math.max(1, Number(e.target.value) || 6)) })}
                    />
                  </label>
                  <input
                    placeholder="层标题(缺省栏目名)"
                    className="w-40 rounded-md border bg-background px-2 py-1 text-sm"
                    value={f.title ?? ""}
                    onChange={(e) => updateFloor(i, { title: e.target.value })}
                  />
                  <div className="ml-auto flex items-center gap-1">
                    <Button size="sm" variant="outline" disabled={i === 0} onClick={() => moveFloor(i, -1)}>
                      上移
                    </Button>
                    <Button size="sm" variant="outline" disabled={i === values.floors.length - 1} onClick={() => moveFloor(i, 1)}>
                      下移
                    </Button>
                    <Switch
                      checked={f.visible}
                      onCheckedChange={(v) => updateFloor(i, { visible: v })}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => setValues({ ...values, floors: values.floors.filter((_, j) => j !== i) })}
                    >
                      删除
                    </Button>
                  </div>
                </div>
                {cat && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    绑定栏目:{cat.name}(/zh-CN/c/{cat.slug})
                  </p>
                )}
              </div>
            );
          })}
          <Button size="sm" variant="outline" onClick={addFloor} disabled={values.floors.length >= FLOOR_MAX}>
            添加楼层({values.floors.length}/{FLOOR_MAX})
          </Button>
        </CardContent>
      </Card>

      {/* 栏目页 */}
      <Card>
        <CardHeader>
          <CardTitle>栏目页布局</CardTitle>
          <CardDescription>两种预设排布</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {CATEGORY_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setValues({ ...values, category: { ...values.category, preset: p.key } })}
                className={`rounded-xl border-2 p-4 text-left transition-colors ${
                  values.category.preset === p.key ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"
                }`}
              >
                <div className="font-semibold">{p.label}</div>
                <p className="mt-1 text-xs text-muted-foreground">{p.desc}</p>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="font-medium">头图区块</div>
              <p className="text-xs text-muted-foreground">栏目页顶部头图(需栏目配置了头图)</p>
            </div>
            <Switch
              checked={values.category.sections.header}
              onCheckedChange={(v) => setValues({ ...values, category: { ...values.category, sections: { ...values.category.sections, header: v } } })}
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving}>
        {saving ? "保存中…" : "保存"}
      </Button>
    </div>
  );
}
