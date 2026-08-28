"use client";

import { useState } from "react";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { toast, Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiPost } from "@/components/admin/api-client";

/**
 * 后台登录页。
 * 登录成功:默认密码未改 → 强制进入安全设置改密;否则进入概览。
 */
export default function AdminLoginPage() {
  const locale = useLocale();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await apiPost<{ mustChangePw: boolean }>("/api/admin/auth/login", { username, password });
      toast.success("登录成功");
      router.replace(r.mustChangePw ? `/${locale}/admin/security?force=1` : `/${locale}/admin/dashboard`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "登录失败");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Toaster richColors position="top-center" />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">管理后台</CardTitle>
          <CardDescription>请使用管理员账号登录</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">用户名</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "登录中…" : "登录"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
