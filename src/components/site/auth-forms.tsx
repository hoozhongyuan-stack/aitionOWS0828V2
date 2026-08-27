"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageCircle } from "lucide-react";

/**
 * 前台登录/注册表单(需求 4.6):
 * - 邮箱密码;微信扫码入口仅在后台启用后展示
 * - 注册强制勾选《用户注册协议》《隐私政策》
 */

function useNext(): string {
  const params = useSearchParams();
  const next = params.get("next");
  return next && next.startsWith("/") ? next : "";
}

export function LoginForm({ wechatEnabled }: { wechatEnabled: boolean }) {
  return (
    <Suspense>
      <LoginFormInner wechatEnabled={wechatEnabled} />
    </Suspense>
  );
}

function LoginFormInner({ wechatEnabled }: { wechatEnabled: boolean }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const next = useNext();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const d = await r.json();
      if (!r.ok || d.ok === false) throw new Error(d.message || "登录失败");
      toast.success(t("loginSuccess"));
      router.replace(next || `/${locale}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "登录失败");
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">{t("login")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t("email")}</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">{t("password")}</Label>
              <Link
                href={`/${locale}/forgot-password`}
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-primary"
              >
                {t("forgotPassword")}
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "…" : t("login")}
          </Button>
        </form>
        {wechatEnabled && (
          <Button variant="outline" className="w-full" asChild>
            <a href={`/api/auth/wechat/login?next=${encodeURIComponent(next || `/${locale}`)}`}>
              <MessageCircle className="h-4 w-4 text-[#07C160]" />
              {t("wechatLogin")}
            </a>
          </Button>
        )}
        <p className="text-center text-sm text-muted-foreground">
          {t("noAccount")}{" "}
          <Link
            href={`/${locale}/register${next ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="text-primary underline underline-offset-2"
          >
            {t("register")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export function RegisterForm() {
  return (
    <Suspense>
      <RegisterFormInner />
    </Suspense>
  );
}

function RegisterFormInner() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const next = useNext();
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("两次输入的密码不一致");
      return;
    }
    if (!agree) {
      toast.error("请先阅读并同意用户协议与隐私政策");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, nickname: nickname || undefined, agree }),
      });
      const d = await r.json();
      if (!r.ok || d.ok === false) throw new Error(d.message || "注册失败");
      toast.success(t("registerSuccess"));
      router.replace(next || `/${locale}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "注册失败");
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">{t("register")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="remail">{t("email")}</Label>
            <Input id="remail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rnick">{t("nickname")}</Label>
            <Input id="rnick" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={30} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rpass">{t("password")}</Label>
            <Input
              id="rpass"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rconfirm">{t("confirmPassword")}</Label>
            <Input
              id="rconfirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <label className="flex items-start gap-2 text-sm text-muted-foreground">
            <Checkbox checked={agree} onCheckedChange={(c) => setAgree(c === true)} className="mt-0.5" />
            <span>
              {t("agreePrefix")}
              <Link href={`/${locale}/agreement/register`} target="_blank" className="text-primary underline">
                《用户注册协议》
              </Link>
              {t("and")}
              <Link href={`/${locale}/agreement/privacy`} target="_blank" className="text-primary underline">
                《隐私政策》
              </Link>
            </span>
          </label>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "…" : t("register")}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          {t("hasAccount")}{" "}
          <Link
            href={`/${locale}/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="text-primary underline underline-offset-2"
          >
            {t("login")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
