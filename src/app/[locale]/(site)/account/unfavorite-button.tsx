"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * 个人中心「取消收藏」(AC-008):调收藏切换 API 取消后 router.refresh()
 * 让服务端列表与计数同步减少。
 */
export function UnfavoriteButton({ contentId }: { contentId: number }) {
  const t = useTranslations("account");
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function unfavorite() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/interaction/favorite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contentId }),
      });
      const d = await r.json();
      if (!r.ok || d.ok === false) throw new Error(d.message || "操作失败");
      router.refresh(); // 服务端重取列表,该项消失、计数同步
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={unfavorite} disabled={busy}>
      {t("unfavorite")}
    </Button>
  );
}
