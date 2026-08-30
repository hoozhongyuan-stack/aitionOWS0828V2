"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ThumbsUp, Share2, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  applyFavoriteOptimism,
  buildLoginRedirectUrl,
  type FavoriteUiState,
} from "@/app/[locale]/(site)/account/logic";

/**
 * 点赞/转发/收藏条(需求 4.8 / V3.0 REQ-006):
 * - 点赞:游客/登录均可,切换式,防刷由服务端保证
 * - 转发:复制当前链接 + 上报计数,适配多语言与全终端(navigator.clipboard 兜底)
 * - 收藏(可选 props,向后兼容):仅登录可用;未登录点击跳登录页并在登录后回本页;
 *   登录点击走乐观更新,请求失败回滚到操作前快照
 *
 * 向后兼容:不传 showFavorite/initialFavorited/authed 的既有调用行为完全不变
 * (收藏按钮默认不渲染,点赞/转发逻辑零改动)。
 */
export function InteractionBar({
  contentId,
  likeCount: initialLike,
  shareCount: initialShare,
  showLike,
  showShare,
  showFavorite = false,
  initialFavorited = false,
  favoriteCount: initialFavoriteCount,
  authed = false,
}: {
  contentId: number;
  likeCount: number;
  shareCount: number;
  showLike: boolean;
  showShare: boolean;
  /** 收藏入口开关(V3.0 REQ-006):默认关闭,存量页面不渲染收藏按钮 */
  showFavorite?: boolean;
  /** 服务端取到的收藏态(未登录恒 false),避免首屏状态闪烁 */
  initialFavorited?: boolean;
  /** 服务端已知的收藏计数;未提供时不展示计数,首次互动后采用接口返回值 */
  favoriteCount?: number;
  /** 登录态:未登录点击收藏 → 登录页(?redirect= 回跳) */
  authed?: boolean;
}) {
  const t = useTranslations("interaction");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(initialLike);
  const [shareCount, setShareCount] = useState(initialShare);
  const [busy, setBusy] = useState(false);
  const [fav, setFav] = useState<FavoriteUiState>({
    favorited: initialFavorited,
    favoriteCount: initialFavoriteCount ?? 0,
  });
  const [favCountKnown, setFavCountKnown] = useState(initialFavoriteCount !== undefined);

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

  /** 收藏切换(REQ-006):未登录 → 登录页带回跳;已登录 → 乐观更新,失败回滚 */
  async function toggleFavorite() {
    if (busy) return;
    if (!authed) {
      router.push(buildLoginRedirectUrl(locale, pathname));
      return;
    }
    setBusy(true);
    const snapshot = fav;
    setFav(applyFavoriteOptimism(snapshot)); // 乐观更新(状态机纯函数,可单测)
    try {
      const r = await fetch("/api/interaction/favorite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contentId }),
      });
      const d = await r.json();
      if (!r.ok || d.ok === false) throw new Error(d.message || "操作失败");
      setFav({ favorited: !!d.data.favorited, favoriteCount: d.data.favoriteCount });
      setFavCountKnown(true);
    } catch (e) {
      setFav(snapshot); // 失败回滚到操作前快照
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
      {showFavorite && (
        <Button
          variant={fav.favorited ? "default" : "outline"}
          size="lg"
          onClick={toggleFavorite}
          disabled={busy}
          className={cn("min-w-32", fav.favorited && "shadow")}
        >
          <Bookmark className={cn("h-4 w-4", fav.favorited && "fill-current")} />
          {fav.favorited ? t("favorited") : t("favorite")}
          {favCountKnown ? `(${fav.favoriteCount})` : ""}
        </Button>
      )}
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
