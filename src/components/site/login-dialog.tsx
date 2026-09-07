"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";

/**
 * 加购登录弹窗(V4.0.1):未登录点「加入购物车」时弹出内嵌登录表单;
 * 登录成功 → 关窗 + 刷新登录态 + 自动完成刚才的加购(由调用方在 onLoggedIn 里执行)。
 */
export function LoginDialog({
  open,
  onOpenChange,
  onLoggedIn,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 登录成功回调(执行挂起的加购) */
  onLoggedIn: () => void;
}) {
  const t = useTranslations("auth");
  const tShop = useTranslations("shop");
  const locale = useLocale();
  const router = useRouter();
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
      onOpenChange(false);
      router.refresh(); // 服务端登录态刷新(头部用户菜单等)
      onLoggedIn(); // 继续挂起的加购
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "登录失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("login")}</DialogTitle>
          <DialogDescription>{tShop("addToCart")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ld-email">{t("email")}</Label>
            <Input id="ld-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ld-password">{t("password")}</Label>
            <Input id="ld-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "…" : t("login")}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            <Link href={`/${locale}/login`} className="underline hover:text-primary">
              前往登录页(含微信扫码) / Register
            </Link>
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
