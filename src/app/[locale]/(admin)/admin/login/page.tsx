"use client";

import { useState } from "react";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { toast, Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/auth/password-input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiPost } from "@/components/admin/api-client";
import { LoginParticles } from "@/components/admin/login-particles";

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
      const r = await apiPost<{ mustChangePw: boolean }>("/api/admin/auth/login", {
        username,
        password,
      });
      toast.success("登录成功");
      router.replace(
        r.mustChangePw ? `/${locale}/admin/security?force=1` : `/${locale}/admin/dashboard`
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "登录失败");
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4">
      <Toaster richColors position="top-center" />
      {/* 科幻粒子背景:pointer-events-none 保证不拦截表单点击 */}
      <LoginParticles />
      <Card className="relative z-10 w-full max-w-sm shadow-[0_0_50px_rgba(6,182,212,0.15)] ring-1 ring-cyan-500/20">
        <CardHeader>
          <CardTitle className="text-lg leading-snug">AiTion中英文GEO友好型官网系统</CardTitle>
          <CardDescription>管理后台 · 请使用管理员账号登录</CardDescription>
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
              <PasswordInput
                id="password"
               
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
        <CardFooter className="justify-center pb-5">
          <span className="text-xs text-muted-foreground">客服邮箱:leooohu@outlook.com</span>
        </CardFooter>
      </Card>
    </main>
  );
}
