"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { apiPost } from "@/components/admin/api-client";

/** 安全设置:修改管理员密码(首次登录默认密码强制修改入口) */

function SecurityInner() {
  const params = useSearchParams();
  const forced = params.get("force") === "1";
  const [oldPassword, setOld] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirm) {
      toast.error("两次输入的新密码不一致");
      return;
    }
    setSaving(true);
    try {
      await apiPost("/api/admin/auth/password", { oldPassword, newPassword });
      toast.success("密码已修改");
      setOld("");
      setNew("");
      setConfirm("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "修改失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">安全设置</h1>
        <p className="text-sm text-muted-foreground">管理员账号安全。</p>
      </div>
      {forced && (
        <Alert variant="destructive">
          <AlertTitle>请先修改默认密码</AlertTitle>
          <AlertDescription>检测到当前使用默认密码 admin888,为保证站点安全请立即修改。</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>修改密码</CardTitle>
          <CardDescription>新密码至少 8 位,建议包含字母与数字</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label>原密码</Label>
              <Input type="password" value={oldPassword} onChange={(e) => setOld(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>新密码</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} required minLength={8} />
            </div>
            <div className="space-y-2">
              <Label>确认新密码</Label>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? "提交中…" : "修改密码"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SecurityPage() {
  return (
    <Suspense>
      <SecurityInner />
    </Suspense>
  );
}
