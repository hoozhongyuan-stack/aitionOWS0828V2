"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * 忘记密码 / 重置密码表单(需求:邮件找回密码)。
 * 申请成功后不透露邮箱是否注册(防账号枚举),统一提示"已发送"。
 */

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fetch("/api/auth/password/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, locale }),
      });
      const d = await r.json();
      if (!r.ok || d.ok === false) throw new Error(d.message || "发送失败");
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "发送失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">{t("forgotTitle")}</CardTitle>
        <CardDescription>{t("forgotDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sent ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("resetSent")}</p>
            <Button asChild variant="outline" className="w-full">
              <Link href={`/${locale}/login`}>{t("backToLogin")}</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "…" : t("sendReset")}
            </Button>
            <p className="text-center text-sm">
              <Link href={`/${locale}/login`} className="text-muted-foreground underline underline-offset-2 hover:text-primary">
                {t("backToLogin")}
              </Link>
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export function ResetPasswordForm() {
  return (
    <Suspense>
      <ResetPasswordFormInner />
    </Suspense>
  );
}

function ResetPasswordFormInner() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error(t("passwordMismatch"));
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const d = await r.json();
      if (!r.ok || d.ok === false) throw new Error(d.message || "重置失败");
      setDone(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "重置失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">{t("resetTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!token ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("resetInvalid")}</p>
            <Button asChild variant="outline" className="w-full">
              <Link href={`/${locale}/forgot-password`}>{t("forgotTitle")}</Link>
            </Button>
          </div>
        ) : done ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("resetSuccess")}</p>
            <Button asChild className="w-full">
              <Link href={`/${locale}/login`}>{t("login")}</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">{t("newPassword")}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">{t("confirmPassword")}</Label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "…" : t("resetSubmit")}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
