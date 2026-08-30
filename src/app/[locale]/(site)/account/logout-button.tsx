"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 个人中心「退出登录」:复用页头既有登出逻辑(POST /api/auth/logout + refresh)。
 * 登出后服务端重渲染本页,未登录态自动跳转登录页。
 */
export function LogoutButton() {
  const t = useTranslations("account");
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    if (busy) return;
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh();
  }

  return (
    <Button variant="outline" size="sm" onClick={logout} disabled={busy}>
      <LogOut className="h-4 w-4" />
      {t("logout")}
    </Button>
  );
}
