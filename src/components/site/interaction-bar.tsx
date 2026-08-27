"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ThumbsUp, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 点赞/转发条(需求 4.8):
 * - 点赞:游客/登录均可,切换式,防刷由服务端保证
 * - 转发:复制当前链接 + 上报计数,适配多语言与全终端(navigator.clipboard 兜底)
 */
export function InteractionBar({
  contentId,
  likeCount: initialLike,
  shareCount: initialShare,
  showLike,
  showShare,
}: {
  contentId: number;
  likeCount: number;
  shareCount: number;
  showLike: boolean;
  showShare: boolean;
}) {
  const t = useTranslations("interaction");
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(initialLike);
  const [shareCount, setShareCount] = useState(initialShare);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!showLike) return;
    fetch(`/api/interaction/like?contentId=${contentId}`)
      .then((r) => r.json())
      .then((d) => setLiked(!!d?.data?.liked))
      .catch(() => {});
  }, [contentId, showLike]);

  async function toggleLike() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/interaction/like", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contentId }),
      });
      const d = await r.json();
      if (!r.ok || d.ok === false) throw new Error(d.message || "操作失败");
      setLiked(d.data.liked);
      setLikeCount(d.data.likeCount);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // 旧终端兜底
        const ta = document.createElement("textarea");
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      toast.success(t("shareCopied"));
      const r = await fetch("/api/interaction/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contentId }),
      });
      const d = await r.json();
      if (d?.data?.shareCount) setShareCount(d.data.shareCount);
    } catch {
      toast.error("复制失败,请手动复制地址栏链接");
    }
  }

  return (
    <div className="mt-10 flex items-center justify-center gap-4 border-t pt-8">
      {showLike && (
        <Button
          variant={liked ? "default" : "outline"}
          size="lg"
          onClick={toggleLike}
          disabled={busy}
          className={cn("min-w-32", liked && "shadow")}
        >
          <ThumbsUp className={cn("h-4 w-4", liked && "fill-current")} />
          {liked ? t("liked") : t("like")}({likeCount})
        </Button>
      )}
      {showShare && (
        <Button variant="outline" size="lg" onClick={share} className="min-w-32">
          <Share2 className="h-4 w-4" />
          {t("share")}({shareCount})
        </Button>
      )}
    </div>
  );
}
