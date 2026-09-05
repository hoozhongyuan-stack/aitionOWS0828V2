"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiGet, apiPut } from "@/components/admin/api-client";

/**
 * V3.2 页面布局配置(方案 A · 轻量):
 * 首页布局预设(3 套)+ 区块显隐;栏目页布局预设(2 套)。
 * 保存即生效(Setting group=layout;缺省=现状布局)。
 */
interface LayoutValues {
  home: { preset: string; sections: { banners: boolean; latest: boolean } };
  category: { preset: string; sections: { header: boolean } };
}

const HOME_PRESETS = [
  { key: "grid", label: "网格(默认)", desc: "轮播 Hero + 最新动态网格,现状布局" },
  { key: "hero-list", label: "大图列表", desc: "全宽 Hero + 最新动态列表条目 + CTA 横幅" },
  { key: "split", label: "分屏", desc: "左右分屏 Hero + 最新动态网格" },
];
const CATEGORY_PRESETS = [
  { key: "list", label: "网格(默认)", desc: "头图 + 卡片网格 + 分页,现状布局" },
  { key: "magazine", label: "杂志", desc: "首条大图特写 + 其余双列 + 侧栏" },
];

export default function PageLayoutPage() {
  const [values, setValues] = useState<LayoutValues | null>(null);
  const [saving, setSaving] = useState(false);

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
        })
      )
      .catch(() => toast.error("布局配置加载失败"));
  }, []);

  if (!values) return <div className="text-sm text-muted-foreground">加载中…</div>;

  const dirty =
    JSON.stringify(values) !== JSON.stringify(values);

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
