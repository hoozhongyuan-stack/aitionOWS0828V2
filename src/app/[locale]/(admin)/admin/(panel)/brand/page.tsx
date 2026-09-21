"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadField } from "@/components/admin/upload-field";
import { AdminSelect } from "@/components/admin/admin-select";
import { apiGet, apiPut } from "@/components/admin/api-client";
import { Plus, Trash2 } from "lucide-react";

/**
 * 品牌信息配置(需求 4.3):
 * 名称 / LOGO / ICO / 备案号 / 版权 / 联系方式 / 社交账号 / 维护模式。
 */

interface Social {
  name: string;
  url: string;
  qrcodeUrl?: string;
}
/** 右侧悬浮入口(V4.8.3):三条类型共用一个编辑行,按 type 显示不同输入 */
interface FloatingRow {
  type: "tel" | "form" | "qrcode";
  iconUrl: string;
  label: string;
  tel: string;
  formId: number | null;
  qrcodeUrl: string;
}
const FLOATING_MAX = 2;
const FLOATING_TYPE_LABEL: Record<FloatingRow["type"], string> = {
  tel: "拨打电话",
  form: "关联表单(弹层填写)",
  qrcode: "微信二维码(弹层展示)",
};
interface BrandValues {
  siteName: string;
  ownerName: string;
  tagline: string;
  logoUrl: string;
  footerLogoUrl: string;
  faviconUrl: string;
  shareImageUrl: string;
  icp: string;
  copyright: string;
  contactPhone: string;
  contactEmail: string;
  contactAddress: string;
  socials: Social[];
  maintenance: boolean;
  maintenanceText: string;
  floating: FloatingRow[];
}

export default function BrandPage() {
  const router = useRouter();
  const [v, setV] = useState<BrandValues | null>(null);
  const [saving, setSaving] = useState(false);
  // 悬浮入口「关联表单」下拉用:只列启用中的表单(停用的表单前台会自动丢弃该入口)
  const [forms, setForms] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    apiGet<Partial<BrandValues>>("/api/admin/settings/brand")
      .then((d) =>
        setV({
          siteName: d.siteName ?? "",
          ownerName: d.ownerName ?? "",
          tagline: d.tagline ?? "",
          logoUrl: d.logoUrl ?? "",
          footerLogoUrl: d.footerLogoUrl ?? "",
          faviconUrl: d.faviconUrl ?? "",
          shareImageUrl: d.shareImageUrl ?? "",
          icp: d.icp ?? "",
          copyright: d.copyright ?? "",
          contactPhone: d.contactPhone ?? "",
          contactEmail: d.contactEmail ?? "",
          contactAddress: d.contactAddress ?? "",
          socials: Array.isArray(d.socials)
            ? d.socials.map((s) => ({ name: s.name ?? "", url: s.url ?? "", qrcodeUrl: s.qrcodeUrl ?? "" }))
            : [],
          maintenance: !!d.maintenance,
          maintenanceText: d.maintenanceText ?? "网站维护中,请稍后访问。",
          floating: (Array.isArray(d.floating) ? d.floating : []).slice(0, FLOATING_MAX).map((f) => ({
            type: (f?.type === "form" || f?.type === "qrcode" ? f.type : "tel") as FloatingRow["type"],
            iconUrl: f?.iconUrl ?? "",
            label: f?.label ?? "",
            tel: f?.tel ?? "",
            formId: typeof f?.formId === "number" ? f.formId : null,
            qrcodeUrl: f?.qrcodeUrl ?? "",
          })),
        })
      )
      .catch((e) => toast.error(e.message));
    apiGet<{ id: number; name: string; enabled: boolean }[]>("/api/admin/forms")
      .then((rows) => setForms(rows.filter((r) => r.enabled).map((r) => ({ id: r.id, name: r.name }))))
      .catch(() => {});
  }, []);

  async function save() {
    if (!v) return;
    setSaving(true);
    try {
      await apiPut("/api/admin/settings/brand", { values: v });
      toast.success("已保存,即时生效");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (!v) return <div className="text-sm text-muted-foreground">加载中…</div>;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">品牌信息</h1>
        <p className="text-sm text-muted-foreground">站点标识、备案版权与联系方式,前台页脚等位置自动引用。</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>站点标识</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>品牌名称</Label>
            <Input value={v.siteName} onChange={(e) => setV({ ...v, siteName: e.target.value })} />
            <p className="text-xs text-muted-foreground">
              将出现在页脚署名、分享卡片与结构化数据 —— 建议用对外品牌名,不要留模板默认值
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>运营主体(选填)</Label>
              <Input
                value={v.ownerName}
                onChange={(e) => setV({ ...v, ownerName: e.target.value })}
                placeholder="个人姓名或公司全称"
              />
              <p className="text-xs text-muted-foreground">用于 llms.txt 自述,向 AI 说明站点由谁运营</p>
            </div>
            <div className="space-y-2">
              <Label>站点一句话定位(选填)</Label>
              <Input
                value={v.tagline}
                onChange={(e) => setV({ ...v, tagline: e.target.value })}
                placeholder="例:酒业数智增长观察站"
                maxLength={60}
              />
              <p className="text-xs text-muted-foreground">
                一处填写、两处使用:llms.txt 自述与结构化数据的 description(AI 判断「你是谁」的直接依据)
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>站点 LOGO(页头,浅底)</Label>
              <UploadField
                value={v.logoUrl}
                onChange={(url) => setV({ ...v, logoUrl: url })}
                label="LOGO"
                hint="建议尺寸 200×60px 左右(横向,透明背景 PNG/SVG),≤2MB"
              />
            </div>
            <div className="space-y-2">
              <Label>页脚 LOGO(深底用,选填)</Label>
              <UploadField
                value={v.footerLogoUrl}
                onChange={(url) => setV({ ...v, footerLogoUrl: url })}
                label="页脚 LOGO"
                hint="白色/金色字标,用于深色页脚;未配置时页脚沿用站点 LOGO"
              />
            </div>
            <div className="space-y-2">
              <Label>ICO 图标(浏览器标签)</Label>
              <UploadField
                value={v.faviconUrl}
                onChange={(url) => setV({ ...v, faviconUrl: url })}
                label="favicon"
                hint="建议尺寸 64×64px 正方形 PNG/ICO,≤512KB"
              />
            </div>
            <div className="space-y-2">
              <Label>默认分享图(社交卡片缩略图)</Label>
              <UploadField
                value={v.shareImageUrl}
                onChange={(url) => setV({ ...v, shareImageUrl: url })}
                label="分享图"
                hint="建议 1200×630px PNG/JPG(微信要求 ≥300×300,过小会被分享卡片忽略)。用于没有封面的页面(如首页未配轮播图时);未配置则回落到站点 LOGO"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>备案与版权</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>备案号</Label>
            <Input placeholder="例:京ICP备xxxxxxxx号" value={v.icp} onChange={(e) => setV({ ...v, icp: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>版权信息</Label>
            <Input value={v.copyright} onChange={(e) => setV({ ...v, copyright: e.target.value })} />
            <p className="text-xs text-muted-foreground">
              想让这行字可点击?跳转链接在「功能设置 → 页脚与客服」里配置。
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>联系方式</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>联系电话</Label>
            <Input value={v.contactPhone} onChange={(e) => setV({ ...v, contactPhone: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>联系邮箱</Label>
            <Input value={v.contactEmail} onChange={(e) => setV({ ...v, contactEmail: e.target.value })} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>联系地址</Label>
            <Input value={v.contactAddress} onChange={(e) => setV({ ...v, contactAddress: e.target.value })} />
            <p className="text-xs text-muted-foreground">
              地址的唯一来源:页脚与结构化数据(给 AI 看的)都使用这里填的地址,请填真实经营地址
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>社交账号</CardTitle>
          <CardDescription>
            展示在前台页脚;链接与二维码至少填一项(微信公众号等场景可只传二维码,链接留空),前台鼠标悬浮账号名时弹出二维码
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {v.socials.map((s, i) => (
            <div key={i} className="space-y-2 rounded-lg border p-3">
              <div className="flex gap-2">
                <Input
                  placeholder="名称(如 微信公众号)"
                  value={s.name}
                  onChange={(e) => {
                    const socials = [...v.socials];
                    socials[i] = { ...s, name: e.target.value };
                    setV({ ...v, socials });
                  }}
                  className="w-48"
                />
                <Input
                  placeholder="链接 https://…(仅二维码时可留空)"
                  value={s.url}
                  onChange={(e) => {
                    const socials = [...v.socials];
                    socials[i] = { ...s, url: e.target.value };
                    setV({ ...v, socials });
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setV({ ...v, socials: v.socials.filter((_, j) => j !== i) })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">二维码(可选)</Label>
                <UploadField
                  value={s.qrcodeUrl ?? ""}
                  onChange={(url) => {
                    const socials = [...v.socials];
                    socials[i] = { ...s, qrcodeUrl: url };
                    setV({ ...v, socials });
                  }}
                  label={`${s.name || "社交账号"} 二维码`}
                  hint="建议尺寸 300×300px 正方形,JPG/PNG,≤1MB"
                />
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setV({ ...v, socials: [...v.socials, { name: "", url: "", qrcodeUrl: "" }] })}
          >
            <Plus className="h-4 w-4" /> 添加社交账号
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>悬浮入口</CardTitle>
          <CardDescription>
            网站右侧固定悬浮的快捷入口,最多 {FLOATING_MAX} 条;不配置则不显示。
            电话项在手机上点按直接拨号;表单项在当前页面弹层里填写提交;二维码项点开看大图。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {v.floating.map((f, i) => {
            const update = (patch: Partial<FloatingRow>) => {
              const floating = [...v.floating];
              floating[i] = { ...f, ...patch };
              setV({ ...v, floating });
            };
            return (
              <div key={i} className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="w-56">
                    <AdminSelect
                      value={f.type}
                      onChange={(val) => update({ type: val as FloatingRow["type"] })}
                      options={[
                        { value: "tel", label: FLOATING_TYPE_LABEL.tel },
                        { value: "form", label: FLOATING_TYPE_LABEL.form },
                        { value: "qrcode", label: FLOATING_TYPE_LABEL.qrcode },
                      ]}
                      placeholder="选择类型"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="删除该入口"
                    onClick={() => setV({ ...v, floating: v.floating.filter((_, idx) => idx !== i) })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap items-start gap-4">
                  <UploadField
                    value={f.iconUrl}
                    onChange={(url) => update({ iconUrl: url })}
                    label="图标(必填)"
                    hint="建议 48×48px 的正方形图标(线条或实底均可),PNG/SVG"
                  />
                  {f.type === "qrcode" && (
                    <UploadField
                      value={f.qrcodeUrl}
                      onChange={(url) => update({ qrcodeUrl: url })}
                      label="二维码图片(必填)"
                      hint="建议 500×500px 正方形,微信个人/企微二维码均可"
                    />
                  )}
                </div>
                {f.type === "tel" && (
                  <div className="space-y-1">
                    <Label>电话号码</Label>
                    <Input
                      value={f.tel}
                      onChange={(e) => update({ tel: e.target.value })}
                      placeholder="例如 18688720565"
                      className="max-w-60"
                    />
                    <p className="text-xs text-muted-foreground">
                      只保留数字与 + - 空格 括号;手机点按会拉起拨号盘
                    </p>
                  </div>
                )}
                {f.type === "form" && (
                  <div className="space-y-1">
                    <Label>关联表单</Label>
                    <div className="max-w-72">
                      <AdminSelect
                        value={f.formId != null ? String(f.formId) : ""}
                        onChange={(val) => update({ formId: val ? Number(val) : null })}
                        options={forms.map((fm) => ({ value: String(fm.id), label: fm.name }))}
                        placeholder={forms.length ? "选择表单" : "暂无可选表单(先在「表单」里新建)"}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      表单停用或删除后,该入口会自动消失(不留死链)
                    </p>
                  </div>
                )}
                <div className="space-y-1">
                  <Label>提示文字</Label>
                  <Input
                    value={f.label}
                    onChange={(e) => update({ label: e.target.value })}
                    placeholder="例如 电话咨询 / 微信咨询"
                    className="max-w-60"
                    maxLength={20}
                  />
                  <p className="text-xs text-muted-foreground">
                    鼠标悬停(手机端展开)时显示;中英双语站点建议写成「电话咨询 · Call」这种混排
                  </p>
                </div>
              </div>
            );
          })}
          <Button
            variant="outline"
            size="sm"
            disabled={v.floating.length >= FLOATING_MAX}
            onClick={() =>
              setV({
                ...v,
                floating: [
                  ...v.floating,
                  { type: "tel", iconUrl: "", label: "", tel: "", formId: null, qrcodeUrl: "" },
                ],
              })
            }
          >
            <Plus className="h-4 w-4" /> 添加一条(最多 {FLOATING_MAX} 条)
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>维护模式</CardTitle>
          <CardDescription>开启后前台所有页面显示维护提示(后台不受影响)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch checked={v.maintenance} onCheckedChange={(c) => setV({ ...v, maintenance: c })} />
            <span className="text-sm">{v.maintenance ? "已开启(前台不可访问)" : "已关闭(正常访问)"}</span>
          </div>
          <div className="space-y-2">
            <Label>维护提示文案</Label>
            <Textarea value={v.maintenanceText} onChange={(e) => setV({ ...v, maintenanceText: e.target.value })} />
          </div>
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
