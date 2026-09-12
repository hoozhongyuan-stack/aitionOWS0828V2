"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { apiGet, apiPut } from "@/components/admin/api-client";

/**
 * 主题外观配置(需求 4.2):
 * 主色/辅助色/背景色/文字色调色板 + 圆角 + 字体/字号/行高 + 页头外观。
 * 保存后立即生效(配置缓存失效 + router.refresh 重新 SSR)。
 */

interface ThemeValues {
  preset: string;
  primary: string;
  secondary: string;
  background: string;
  foreground: string;
  mutedTextColor: string;
  radius: string;
  fontSans: string;
  fontHeading: string;
  fontSize: string;
  lineHeight: string;
  logoHeight: string;
  navFontSize: string;
  navBold: boolean;
  // V4.4.0 前台透明感
  cardAlpha: number; // 卡片不透明度 0.6–1.0
  cardBlur: boolean; // 卡片背景模糊(毛玻璃)
  headerGlass: boolean; // 前台页头通透
}

/**
 * 预设可预填的字段:配色 + 圆角(排除页头字号等场景字段)。
 * fontHeading 可选——大多数主题跟随正文字体,只有需要衬线气质的主题(如窖藏)推荐显式设置。
 */
type PresetValues = Omit<ThemeValues, "fontSans" | "fontHeading" | "fontSize" | "lineHeight" | "logoHeight" | "navFontSize" | "navBold" | "cardAlpha" | "cardBlur" | "headerGlass"> & {
  fontHeading?: string;
};

/** V3.1.1 主题风格包:推荐调色板(切换预设即填入下方字段,仍可微调);V4.2.1 +窖藏 */
const THEME_PRESETS: Record<string, { label: string; desc: string; values: PresetValues }> = {
  classic: {
    label: "经典",
    desc: "明快清爽的浅色官网风格(默认)",
    values: {
      preset: "classic",
      primary: "#0f172a",
      secondary: "#f1f5f9",
      background: "#ffffff",
      foreground: "#020817",
      mutedTextColor: "#64748b",
      radius: "0.5rem",
    },
  },
  aurora: {
    label: "极光",
    desc: "深色底·霓虹渐变·毛玻璃·光效·动效,高大上炫酷风",
    values: {
      preset: "aurora",
      primary: "#22d3ee",
      secondary: "#1e293b",
      background: "#0b1020",
      foreground: "#e6eaf2",
      mutedTextColor: "#8b93a7",
      radius: "1rem",
    },
  },
  harvest: {
    label: "禾野",
    desc: "农业审美·麦绿丰收金·暖米白纸纹·衬线标题·自然生长动效,农产品/食品站推荐",
    values: {
      preset: "harvest",
      primary: "#4a7c43",
      secondary: "#f0ead8",
      background: "#faf7f0",
      foreground: "#2c3327",
      mutedTextColor: "#8b6f4e",
      radius: "1.1rem",
    },
  },
  cellar: {
    label: "窖藏",
    desc: "酒类行业审美·朱砂红墨金·金线点缀·近直角·衬线标题,白酒/酒类品牌官网推荐",
    values: {
      preset: "cellar",
      primary: "#9E2B25",
      secondary: "#26221C",
      background: "#15120E",
      foreground: "#EAE0CF",
      mutedTextColor: "#9C8E78",
      radius: "0.125rem",
      fontHeading: "Georgia, 'Times New Roman', 'Songti SC', SimSun, serif",
    },
  },
  burgundy: {
    label: "勃艮第",
    desc: "酒红浅底·香槟金点缀·酒珠粒子动效,酒业专业刊物风(推荐)",
    values: {
      preset: "burgundy",
      primary: "#8e1c2e",
      secondary: "#f3ebdd",
      background: "#fdfbf8",
      foreground: "#261d18",
      mutedTextColor: "#8a7b70",
      radius: "0.875rem",
    },
  },
};

const FONT_PRESETS = [
  { label: "系统默认(推荐)", value: "system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif" },
  { label: "无衬线 · 现代", value: "'Helvetica Neue', Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" },
  { label: "衬线 · 杂志感", value: "Georgia, 'Times New Roman', 'Songti SC', SimSun, serif" },
  { label: "等宽 · 极客", value: "'SF Mono', Consolas, 'Courier New', monospace" },
];

/** ThemeValues 中字符串类型字段的 key(颜色等;排除 navBold 这类布尔字段) */
type StringKeys = { [K in keyof ThemeValues]: ThemeValues[K] extends string ? K : never }[keyof ThemeValues];

const COLOR_FIELDS: { key: StringKeys; label: string; desc: string }[] = [
  { key: "primary", label: "主色 / 按钮色", desc: "品牌主色,按钮、强调元素" },
  { key: "secondary", label: "辅助色", desc: "次要按钮、区块底色" },
  { key: "background", label: "背景色", desc: "页面背景" },
  { key: "foreground", label: "文字色", desc: "正文文字颜色" },
  {
    key: "mutedTextColor",
    label: "次要文字色",
    desc: "全站大量次要文字统一走这里:面包屑、日期、卡片摘要、页脚链接、表格内容、输入框占位文字等(独立于文字色单独配置)",
  },
];

/** 非 hex 的历史值(HSL 三元组)在色板中显示为灰色兜底 */
function toColorInput(v: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : "#888888";
}

export default function ThemePage() {
  const router = useRouter();
  const [values, setValues] = useState<ThemeValues | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet<ThemeValues>("/api/admin/settings/theme")
      .then((v) =>
        setValues({
          preset: v.preset ?? "classic",
          primary: v.primary ?? "#0f172a",
          secondary: v.secondary ?? "#f1f5f9",
          background: v.background ?? "#ffffff",
          foreground: v.foreground ?? "#020817",
          mutedTextColor: v.mutedTextColor ?? "#64748b",
          radius: v.radius ?? "0.5rem",
          fontSans: v.fontSans ?? FONT_PRESETS[0].value,
          fontHeading: v.fontHeading ?? "",
          fontSize: v.fontSize ?? "16px",
          lineHeight: v.lineHeight ?? "1.6",
          logoHeight: v.logoHeight ?? "40px",
          navFontSize: v.navFontSize ?? "15px",
          navBold: v.navBold ?? false,
          cardAlpha: typeof v.cardAlpha === "number" ? v.cardAlpha : 1,
          cardBlur: v.cardBlur ?? false,
          headerGlass: v.headerGlass ?? false,
        })
      )
      .catch((e) => toast.error(e.message));
  }, []);

  async function save() {
    if (!values) return;
    setSaving(true);
    try {
      await apiPut("/api/admin/settings/theme", { values });
      toast.success("已保存,主题即时生效");
      router.refresh(); // 重新 SSR,当前页立即呈现新主题
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (!values) return <div className="text-sm text-muted-foreground">加载中…</div>;

  const set = (k: keyof ThemeValues, v: string | boolean | number) => setValues({ ...values, [k]: v });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">主题外观</h1>
        <p className="text-sm text-muted-foreground">调色板与字体全局生效,保存后无需重启。</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>主题风格(V3.1.1)</CardTitle>
          <CardDescription>
            选择整套前台视觉风格;切换会自动填入该主题的推荐配色(下方颜色字段仍可微调)。保存后前台立即生效。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {Object.entries(THEME_PRESETS).map(([key, p]) => {
            const active = values.preset === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setValues({ ...values, ...p.values })}
                className={`rounded-xl border-2 p-4 text-left transition-colors ${
                  active ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{p.label}</span>
                  {active && <span className="text-xs font-medium text-primary">当前</span>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>
                <div className="mt-3 flex gap-2">
                  <span className="h-6 w-6 rounded-full border" style={{ background: p.values.primary }} />
                  <span className="h-6 w-6 rounded-full border" style={{ background: p.values.secondary }} />
                  <span className="h-6 w-6 rounded-full border" style={{ background: p.values.background }} />
                </div>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>主题色</CardTitle>
          <CardDescription>五色体系自动衍生边框、弱化色等全套视觉变量</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {COLOR_FIELDS.map((f) => (
            <div key={f.key} className="flex items-center gap-3 rounded-lg border p-3">
              <input
                type="color"
                value={toColorInput(values[f.key])}
                onChange={(e) => set(f.key, e.target.value)}
                className="h-10 w-10 cursor-pointer rounded border bg-transparent"
                aria-label={f.label}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{f.label}</div>
                <div className="truncate text-xs text-muted-foreground">{f.desc}</div>
              </div>
              <Input
                value={values[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
                className="w-28 font-mono text-xs"
              />
            </div>
          ))}
          <div className="flex items-center gap-3 rounded-lg border p-3 sm:col-span-2">
            <div className="flex-1">
              <div className="text-sm font-medium">圆角</div>
              <div className="text-xs text-muted-foreground">按钮、卡片等组件圆角大小</div>
            </div>
            <Select value={values.radius} onValueChange={(v) => set("radius", v)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0rem">直角(0)</SelectItem>
                <SelectItem value="0.3rem">小圆角(0.3rem)</SelectItem>
                <SelectItem value="0.5rem">标准(0.5rem)</SelectItem>
                <SelectItem value="0.75rem">大圆角(0.75rem)</SelectItem>
                <SelectItem value="1rem">超大(1rem)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>字体排印</CardTitle>
          <CardDescription>全站字体、标题字体与字号行高微调</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>全站字体</Label>
              <Select value={values.fontSans} onValueChange={(v) => set("fontSans", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="选择字体" />
                </SelectTrigger>
                <SelectContent>
                  {FONT_PRESETS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>标题字体(留空跟随全站)</Label>
              <Select
                value={values.fontHeading || "__inherit__"}
                onValueChange={(v) => set("fontHeading", v === "__inherit__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__inherit__">跟随全站字体</SelectItem>
                  {FONT_PRESETS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>基础字号</Label>
              <Select value={values.fontSize} onValueChange={(v) => set("fontSize", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["14px", "15px", "16px", "17px", "18px"].map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>正文行高</Label>
              <Select value={values.lineHeight} onValueChange={(v) => set("lineHeight", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["1.4", "1.5", "1.6", "1.75", "2"].map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="rounded-lg border bg-muted/40 p-4">
            <div className="font-heading text-lg font-semibold">预览:企业官网标题样式</div>
            <p className="mt-1 text-sm text-muted-foreground">
              正文预览:高度自定义 · 本地部署 · AI 检索友好。保存后全站(含本页)即时应用新主题。
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="sm">主按钮</Button>
              <Button size="sm" variant="secondary">
                次按钮
              </Button>
              <Button size="sm" variant="outline">
                描边按钮
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>页头外观</CardTitle>
          <CardDescription>首页顶部 LOGO 大小与导航文字样式,三档可调</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>LOGO 高度</Label>
            <Select value={values.logoHeight} onValueChange={(v) => set("logoHeight", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="32px">小(32px)</SelectItem>
                <SelectItem value="40px">标准(40px)</SelectItem>
                <SelectItem value="48px">大(48px)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>导航字号</Label>
            <Select value={values.navFontSize} onValueChange={(v) => set("navFontSize", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="14px">小(14px)</SelectItem>
                <SelectItem value="15px">标准(15px)</SelectItem>
                <SelectItem value="16px">大(16px)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>导航加粗</Label>
            <div className="flex h-9 items-center gap-2">
              <Switch checked={values.navBold} onCheckedChange={(c) => set("navBold", c)} />
              <span className="text-sm text-muted-foreground">{values.navBold ? "加粗" : "常规"}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* V4.4.0 前台透明感 */}
      <Card>
        <CardHeader>
          <CardTitle>前台透明感(V4.4.0)</CardTitle>
          <CardDescription>
            让前台卡片与页头呈现通透质感。默认不启用——不调整时外观与之前完全一致；仅作用于前台，后台不受影响。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="card-alpha">卡片通透度</Label>
              <span className="text-sm text-muted-foreground">
                {values.cardAlpha >= 1 ? "不透明（默认）" : `${Math.round((1 - values.cardAlpha) * 100)}% 通透`}
              </span>
            </div>
            <input
              id="card-alpha"
              type="range"
              min={0.6}
              max={1}
              step={0.02}
              value={values.cardAlpha}
              onChange={(e) => set("cardAlpha", Number(e.target.value))}
              className="w-full accent-primary"
            />
            <p className="text-xs text-muted-foreground">
              范围 60%–100%；下限 60% 是为保证文字对比度。与下方「背景模糊」搭配效果最佳。
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-lg border p-3">
            <Switch id="card-blur" checked={values.cardBlur} onCheckedChange={(c) => set("cardBlur", c)} />
            <div className="flex-1">
              <Label htmlFor="card-blur">卡片背景模糊（毛玻璃）</Label>
              <p className="text-xs text-muted-foreground">卡片背景做模糊处理，透出后方内容，质感更像玻璃</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border p-3">
            <Switch id="header-glass" checked={values.headerGlass} onCheckedChange={(c) => set("headerGlass", c)} />
            <div className="flex-1">
              <Label htmlFor="header-glass">页头通透</Label>
              <p className="text-xs text-muted-foreground">页头半透明并模糊，滚动时内容从底下透出</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? "保存中…" : "保存主题"}
        </Button>
      </div>
    </div>
  );
}
