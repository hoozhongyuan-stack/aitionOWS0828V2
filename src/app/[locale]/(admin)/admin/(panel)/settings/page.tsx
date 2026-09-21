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
        <SwitchRow
          label="点赞"
          desc="内容页点赞/取消点赞"
          checked={!!v.like}
          onChange={(c) => set("like", c)}
        />
        <SwitchRow
          label="转发"
          desc="内容页复制链接转发与计数"
          checked={!!v.share}
          onChange={(c) => set("share", c)}
        />
        <SwitchRow
          label="评论"
          desc="内容页评论(提交后需审核)"
          checked={!!v.comment}
          onChange={(c) => set("comment", c)}
        />
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
            <Label>单文件大小上限(MB,视频固定 400MB 不受此项影响)</Label>
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
            <Input
              value={String(v.appId ?? "")}
              onChange={(e) => setValues({ ...v, appId: e.target.value })}
            />
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
          回调地址请在微信开放平台配置为:
          <code className="rounded bg-muted px-1">https://你的域名/api/auth/wechat/callback</code>
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
          常见邮箱 SMTP:QQ 邮箱/企业邮箱 smtp.exmail.qq.com:465,阿里企业邮箱
          smtp.qiye.aliyun.com:465, 需先在邮箱后台开启 SMTP 服务并使用授权码(不是登录密码)。
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
            <Input
              value={String(v.notFoundTitle ?? "")}
              onChange={(e) => setValues({ ...v, notFoundTitle: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>404 描述</Label>
            <Input
              value={String(v.notFoundDesc ?? "")}
              onChange={(e) => setValues({ ...v, notFoundDesc: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>500 标题</Label>
            <Input
              value={String(v.errorTitle ?? "")}
              onChange={(e) => setValues({ ...v, errorTitle: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>500 描述</Label>
            <Input
              value={String(v.errorDesc ?? "")}
              onChange={(e) => setValues({ ...v, errorDesc: e.target.value })}
            />
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

/**
 * 拟真互动数据(V4.8.0)。
 * 说明先行:本页所有参数只影响前台"展示出来的"阅读/点赞/转发数字,
 * 真实计数(Content.viewCount 等)永不被改写;关闭总开关后前台立即回到真实值。
 */
function StatsTab() {
  const { values: v, setValues, save, saving } = useGroup("stats");
  if (!v) return <div className="text-sm text-muted-foreground">加载中…</div>;
  const set = (k: string, val: unknown) => setValues({ ...v, [k]: val });
  const num = (k: string, fallback: number) => {
    const n = Number(v[k]);
    return Number.isFinite(n) ? n : fallback;
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>拟真互动数据</CardTitle>
        <CardDescription>
          为阅读量/点赞量/转发量生成拟真增长的展示值:发布越久自然越长,真实阅读再按随机系数放大。
          只影响前台展示,真实计数不改动;关闭后前台立即显示真实值。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SwitchRow
          label="启用拟真数据"
          desc="关闭(默认)= 前台显示真实计数,与未升级时完全一致"
          checked={!!v.enabled}
          onChange={(c) => set("enabled", c)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>篇均基数(30 天累计阅读中位数)</Label>
            <Input
              type="number"
              min={1}
              value={String(num("baseViews", 300))}
              onChange={(e) => set("baseViews", Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              一篇内容发布后 30 天的累计阅读量中位数。300 ≈ 头一天约 70、一周约 200。
            </p>
          </div>
          <div className="space-y-1">
            <Label>全局强度倍数</Label>
            <Input
              type="number"
              step="0.1"
              min={0.05}
              value={String(num("scale", 1))}
              onChange={(e) => set("scale", Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">整体放大/缩小自然增长量,1 = 不做额外缩放。</p>
          </div>
          <div className="space-y-1">
            <Label>篇间差异(σ)</Label>
            <Input
              type="number"
              step="0.1"
              min={0}
              max={2}
              value={String(num("spread", 0.8))}
              onChange={(e) => set("spread", Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              越大越分散(0.8 ≈ 多数在基数的 0.45~2.2 倍之间,少数爆款更高)。
            </p>
          </div>
          <div className="space-y-1">
            <Label>冷却速度</Label>
            <Input
              type="number"
              step="0.05"
              min={0.3}
              max={2}
              value={String(num("decay", 0.95))}
              onChange={(e) => set("decay", Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              决定多久冷下来:0.8 长尾更长,1.2 冷得更快。
            </p>
          </div>
          <div className="space-y-1">
            <Label>真实阅读放大系数</Label>
            <Input
              type="number"
              step="1"
              min={0}
              max={500}
              value={String(num("amplify", 12))}
              onChange={(e) => set("amplify", Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              1 次真实阅读 ≈ 多少次展示阅读(每天系数独立随机,并分 5 天慢慢释放)。
            </p>
          </div>
          <div className="space-y-1">
            <Label>种子盐</Label>
            <div className="flex gap-2">
              <Input
                value={String(v.seedSalt ?? "v1")}
                onChange={(e) => set("seedSalt", e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => set("seedSalt", Math.random().toString(36).slice(2, 10))}
              >
                重掷
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              换一个值 = 全站曲线重排(量级不变)。对某篇文章单独重掷,在内容编辑页。
            </p>
          </div>
          <div className="space-y-1">
            <Label>点赞率(%)</Label>
            <Input
              type="number"
              step="0.1"
              min={0}
              max={50}
              value={String(Number((num("likeRate", 0.022) * 100).toFixed(2)))}
              onChange={(e) => set("likeRate", Number(e.target.value) / 100)}
            />
            <p className="text-xs text-muted-foreground">点赞量 ≈ 展示阅读 × 该比例。</p>
          </div>
          <div className="space-y-1">
            <Label>转发率(%)</Label>
            <Input
              type="number"
              step="1"
              min={0}
              max={100}
              value={String(Number((num("shareRate", 0.22) * 100).toFixed(1)))}
              onChange={(e) => set("shareRate", Number(e.target.value) / 100)}
            />
            <p className="text-xs text-muted-foreground">转发量 ≈ 展示点赞 × 该比例。</p>
          </div>
          <div className="space-y-1">
            <Label>收藏率(%)</Label>
            <Input
              type="number"
              step="0.1"
              min={0}
              max={50}
              value={String(Number((num("favoriteRate", 0.01) * 100).toFixed(2)))}
              onChange={(e) => set("favoriteRate", Number(e.target.value) / 100)}
            />
            <p className="text-xs text-muted-foreground">
              收藏量 ≈ 展示阅读 × 该比例(干货型内容可调到 2~3%,高于点赞也很正常)。
            </p>
          </div>
        </div>

        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          拟真数据只作用于前台展示层;后台内容列表会并排显示「真实 / 展示」两组数字,随时可核对。
          真实阅读的放大部分会在 5 天内陆续涨出来(不是立刻跳变),单篇可在内容编辑页关闭或指定基数。
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

/**
 * 页脚与客服(V4.8.3)。
 * 这两个字段属于品牌配置(brand 组),只是编辑入口放在这里:
 *  - 版权跳转链接:页脚版权文字的 href,留空则渲染为纯文本;
 *  - 客服邮箱:显示在后台登录页卡片底部,留空则不显示该行。
 */
function FooterContactTab() {
  const { values: v, setValues, save, saving } = useGroup("brand");
  if (!v) return <div className="text-sm text-muted-foreground">加载中…</div>;
  const set = (k: string, val: unknown) => setValues({ ...v, [k]: val });
  return (
    <Card>
      <CardHeader>
        <CardTitle>页脚与客服</CardTitle>
        <CardDescription>
          页脚版权文字的跳转链接,以及后台登录页显示的客服邮箱。保存后即时生效。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>版权信息跳转链接</Label>
          <Input
            value={String(v.copyrightUrl ?? "")}
            onChange={(e) => set("copyrightUrl", e.target.value)}
            placeholder="https://example.com(留空 = 版权文字不可点击)"
          />
          <p className="text-xs text-muted-foreground">
            只支持 http/https 开头的完整网址;版权文字本身在「品牌信息 → 版权信息」里修改。
          </p>
        </div>
        <div className="space-y-2">
          <Label>客服邮箱</Label>
          <Input
            value={String(v.supportEmail ?? "")}
            onChange={(e) => set("supportEmail", e.target.value)}
            placeholder="support@example.com(留空 = 登录页不显示该行)"
          />
          <p className="text-xs text-muted-foreground">
            显示在后台登录页「客服邮箱:」那一行,方便子账号/同事遇到问题时联系。
          </p>
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
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">功能设置</h1>
        <p className="text-sm text-muted-foreground">
          互动开关、上传限制、第三方登录、错误页、拟真数据与页脚客服信息。
        </p>
      </div>
      <Tabs defaultValue="features">
        <TabsList>
          <TabsTrigger value="features">功能开关</TabsTrigger>
          <TabsTrigger value="upload">上传限制</TabsTrigger>
          <TabsTrigger value="wechat">微信登录</TabsTrigger>
          <TabsTrigger value="notify">通知</TabsTrigger>
          <TabsTrigger value="errors">错误页</TabsTrigger>
          <TabsTrigger value="stats">拟真数据</TabsTrigger>
          <TabsTrigger value="footer">页脚与客服</TabsTrigger>
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
        <TabsContent value="stats">
          <StatsTab />
        </TabsContent>
        <TabsContent value="footer">
          <FooterContactTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
