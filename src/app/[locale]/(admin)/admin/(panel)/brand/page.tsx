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
interface BrandValues {
  siteName: string;
  logoUrl: string;
  faviconUrl: string;
  icp: string;
  copyright: string;
  contactPhone: string;
  contactEmail: string;
  contactAddress: string;
  socials: Social[];
  maintenance: boolean;
  maintenanceText: string;
}

export default function BrandPage() {
  const router = useRouter();
  const [v, setV] = useState<BrandValues | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet<Partial<BrandValues>>("/api/admin/settings/brand")
      .then((d) =>
        setV({
          siteName: d.siteName ?? "",
          logoUrl: d.logoUrl ?? "",
          faviconUrl: d.faviconUrl ?? "",
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
        })
      )
      .catch((e) => toast.error(e.message));
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
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>站点 LOGO</Label>
              <UploadField
                value={v.logoUrl}
                onChange={(url) => setV({ ...v, logoUrl: url })}
                label="LOGO"
                hint="建议尺寸 200×60px 左右(横向,透明背景 PNG/SVG),≤2MB"
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
