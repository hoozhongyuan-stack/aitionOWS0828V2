"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet, apiPut, apiPost } from "@/components/admin/api-client";

/**
 * 功能设置(合并页):
 * - 功能开关(需求 4.8 总开关:点赞/转发/评论/投稿 + 强制登录)
 * - 上传限制(需求 4.7)
 * - 微信登录(需求 4.6,secret 脱敏存储)
 * - 通知(新增需求:表单提交/用户投稿时邮件提醒管理员)
 * - 错误页文案(需求 5)
 */

type Dict = Record<string, unknown>;

const MIME_OPTIONS = [
  { label: "JPG 图片", value: "image/jpeg" },
  { label: "PNG 图片", value: "image/png" },
  { label: "WebP 图片", value: "image/webp" },
  { label: "GIF 动图", value: "image/gif" },
  { label: "SVG 矢量图", value: "image/svg+xml" },
  { label: "MP4 视频", value: "video/mp4" },
  { label: "PDF 文档", value: "application/pdf" },
];

function useGroup(group: string) {
  const [values, setValues] = useState<Dict | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    apiGet<Dict>(`/api/admin/settings/${group}`)
      .then(setValues)
      .catch((e) => toast.error(e.message));
  }, [group]);
  async function save() {
    if (!values) return;
    setSaving(true);
    try {
      await apiPut(`/api/admin/settings/${group}`, { values });
      toast.success("已保存,即时生效");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }
  return { values, setValues, save, saving };
}

function SwitchRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (c: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function FeaturesTab() {
  const { values: v, setValues, save, saving } = useGroup("features");
  if (!v) return <div className="text-sm text-muted-foreground">加载中…</div>;
  const set = (k: string, val: boolean) => setValues({ ...v, [k]: val });
  return (
    <Card>
      <CardHeader>
        <CardTitle>功能总开关</CardTitle>
        <CardDescription>关闭后前台立即隐藏对应入口,接口同步拒绝写入</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <SwitchRow label="点赞" desc="内容页点赞/取消点赞" checked={!!v.like} onChange={(c) => set("like", c)} />
        <SwitchRow label="转发" desc="内容页复制链接转发与计数" checked={!!v.share} onChange={(c) => set("share", c)} />
        <SwitchRow label="评论" desc="内容页评论(提交后需审核)" checked={!!v.comment} onChange={(c) => set("comment", c)} />
        <SwitchRow
          label="评论需登录"
          desc="关闭后允许游客评论(仍需审核)"
          checked={!!v.commentLoginRequired}
          onChange={(c) => set("commentLoginRequired", c)}
        />
        <SwitchRow
          label="用户投稿"
          desc="登录用户可向允许的栏目投稿(需审核)"
          checked={!!v.submission}
          onChange={(c) => set("submission", c)}
        />
        <SwitchRow
          label="强制登录浏览"
          desc="开启后游客访问前台将跳转登录页"
          checked={!!v.forceLogin}
          onChange={(c) => set("forceLogin", c)}
        />
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function UploadTab() {
  const { values: v, setValues, save, saving } = useGroup("upload");
  if (!v) return <div className="text-sm text-muted-foreground">加载中…</div>;
  const types = Array.isArray(v.allowedTypes) ? (v.allowedTypes as string[]) : [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>上传限制</CardTitle>
        <CardDescription>约束所有上传入口(后台/用户/表单)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>单文件大小上限(MB)</Label>
            <Input
              type="number"
              min={1}
              value={String(v.maxSizeMB ?? 10)}
              onChange={(e) => setValues({ ...v, maxSizeMB: Number(e.target.value) || 10 })}
            />
          </div>
          <div className="space-y-2">
            <Label>单次最多文件数</Label>
            <Input
              type="number"
              min={1}
              value={String(v.maxCount ?? 20)}
              onChange={(e) => setValues({ ...v, maxCount: Number(e.target.value) || 20 })}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>允许的文件类型</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {MIME_OPTIONS.map((m) => (
              <label key={m.value} className="flex items-center gap-2 rounded border p-2 text-sm">
                <Checkbox
                  checked={types.includes(m.value)}
                  onCheckedChange={(c) =>
                    setValues({
                      ...v,
                      allowedTypes: c ? [...types, m.value] : types.filter((t) => t !== m.value),
                    })
                  }
                />
                {m.label}
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function WechatTab() {
  const { values: v, setValues, save, saving } = useGroup("wechat");
  if (!v) return <div className="text-sm text-muted-foreground">加载中…</div>;
  return (
    <Card>
      <CardHeader>
        <CardTitle>微信扫码登录(PC)</CardTitle>
        <CardDescription>
          填入微信开放平台「网站应用」的 AppID/AppSecret 并开启;未配置时前台自动隐藏微信登录入口。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Switch checked={!!v.enabled} onCheckedChange={(c) => setValues({ ...v, enabled: c })} />
          <span className="text-sm">{v.enabled ? "已启用" : "未启用"}</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>AppID</Label>
            <Input value={String(v.appId ?? "")} onChange={(e) => setValues({ ...v, appId: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>AppSecret(保存后脱敏显示)</Label>
            <Input
              type="password"
              value={String(v.appSecret ?? "")}
              onChange={(e) => setValues({ ...v, appSecret: e.target.value })}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          回调地址请在微信开放平台配置为:<code className="rounded bg-muted px-1">https://你的域名/api/auth/wechat/callback</code>
          。H5(公众号)登录字段已预留,当前版本未启用。
        </p>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function NotifyTab() {
  const { values: v, setValues, save, saving } = useGroup("notify");
  const [testing, setTesting] = useState(false);

  if (!v) return <div className="text-sm text-muted-foreground">加载中…</div>;

  async function sendTest() {
    if (!v) return;
    setTesting(true);
    try {
      await apiPost("/api/admin/settings/notify/test", {
        values: {
          adminEmail: String(v.adminEmail ?? ""),
          smtpHost: String(v.smtpHost ?? ""),
          smtpPort: Number(v.smtpPort ?? 465),
          smtpSecure: !!v.smtpSecure,
          smtpUser: String(v.smtpUser ?? ""),
          smtpPassword: String(v.smtpPassword ?? ""),
          fromName: String(v.fromName ?? ""),
          fromEmail: String(v.fromEmail ?? ""),
        },
      });
      toast.success("测试邮件已发送,请查收管理员邮箱");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "发送失败");
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>管理员通知</CardTitle>
        <CardDescription>
          用户提交表单或投稿时,通过 SMTP 邮件提醒管理员;未配置 SMTP 时自动跳过,不影响用户提交
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Switch checked={!!v.enabled} onCheckedChange={(c) => setValues({ ...v, enabled: c })} />
          <span className="text-sm">{v.enabled ? "已启用" : "未启用"}</span>
        </div>
        <div className="space-y-2">
          <Label>管理员邮箱(接收通知,多个用英文逗号分隔)</Label>
          <Input
            value={String(v.adminEmail ?? "")}
            onChange={(e) => setValues({ ...v, adminEmail: e.target.value })}
            placeholder="admin@example.com"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>SMTP 服务器地址</Label>
            <Input
              value={String(v.smtpHost ?? "")}
              onChange={(e) => setValues({ ...v, smtpHost: e.target.value })}
              placeholder="smtp.exmail.qq.com"
            />
          </div>
          <div className="space-y-2">
            <Label>端口</Label>
            <Input
              type="number"
              value={String(v.smtpPort ?? 465)}
              onChange={(e) => setValues({ ...v, smtpPort: Number(e.target.value) || 465 })}
            />
          </div>
          <div className="space-y-2">
            <Label>SMTP 账号</Label>
            <Input
              value={String(v.smtpUser ?? "")}
              onChange={(e) => setValues({ ...v, smtpUser: e.target.value })}
              placeholder="notify@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label>SMTP 密码(保存后脱敏显示)</Label>
            <Input
              type="password"
              value={String(v.smtpPassword ?? "")}
              onChange={(e) => setValues({ ...v, smtpPassword: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>发件人显示名(可选)</Label>
            <Input
              value={String(v.fromName ?? "")}
              onChange={(e) => setValues({ ...v, fromName: e.target.value })}
              placeholder="留空则用站点名"
            />
          </div>
          <div className="space-y-2">
            <Label>发件人邮箱(可选)</Label>
            <Input
              value={String(v.fromEmail ?? "")}
              onChange={(e) => setValues({ ...v, fromEmail: e.target.value })}
              placeholder="留空则用 SMTP 账号"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={!!v.smtpSecure}
            onCheckedChange={(c) => setValues({ ...v, smtpSecure: !!c })}
          />
          使用 SSL(端口 465 通常勾选;587/25 端口通常不勾选)
        </label>
        <p className="text-xs text-muted-foreground">
          常见邮箱 SMTP:QQ 邮箱/企业邮箱 smtp.exmail.qq.com:465,阿里企业邮箱 smtp.qiye.aliyun.com:465,
          需先在邮箱后台开启 SMTP 服务并使用授权码(不是登录密码)。
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={sendTest} disabled={testing}>
            {testing ? "发送中…" : "发送测试邮件"}
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ErrorsTab() {
  const { values: v, setValues, save, saving } = useGroup("errors");
  if (!v) return <div className="text-sm text-muted-foreground">加载中…</div>;
  return (
    <Card>
      <CardHeader>
        <CardTitle>错误页文案</CardTitle>
        <CardDescription>自定义 404 / 500 页面展示内容</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>404 标题</Label>
            <Input value={String(v.notFoundTitle ?? "")} onChange={(e) => setValues({ ...v, notFoundTitle: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>404 描述</Label>
            <Input value={String(v.notFoundDesc ?? "")} onChange={(e) => setValues({ ...v, notFoundDesc: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>500 标题</Label>
            <Input value={String(v.errorTitle ?? "")} onChange={(e) => setValues({ ...v, errorTitle: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>500 描述</Label>
            <Input value={String(v.errorDesc ?? "")} onChange={(e) => setValues({ ...v, errorDesc: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">功能设置</h1>
        <p className="text-sm text-muted-foreground">互动开关、上传限制、第三方登录与错误页。</p>
      </div>
      <Tabs defaultValue="features">
        <TabsList>
          <TabsTrigger value="features">功能开关</TabsTrigger>
          <TabsTrigger value="upload">上传限制</TabsTrigger>
          <TabsTrigger value="wechat">微信登录</TabsTrigger>
          <TabsTrigger value="notify">通知</TabsTrigger>
          <TabsTrigger value="errors">错误页</TabsTrigger>
        </TabsList>
        <TabsContent value="features">
          <FeaturesTab />
        </TabsContent>
        <TabsContent value="upload">
          <UploadTab />
        </TabsContent>
        <TabsContent value="wechat">
          <WechatTab />
        </TabsContent>
        <TabsContent value="notify">
          <NotifyTab />
        </TabsContent>
        <TabsContent value="errors">
          <ErrorsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
