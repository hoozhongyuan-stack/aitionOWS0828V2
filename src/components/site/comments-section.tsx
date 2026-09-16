"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { safeDateLocale } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare } from "lucide-react";

/**
 * 评论区(需求 4.8):
 * - 仅展示后台审核通过的评论
 * - 提交后提示"待审核",绝不即时上屏
 * - 需登录开关关闭时,游客可填昵称评论
 */

interface CommentItem {
  id: number;
  body: string;
  createdAt: string;
  author: string;
  isAuthorReply?: boolean;
  replies?: { id: number; body: string; createdAt: string; author: string; isAuthorReply?: boolean }[];
}

export function CommentsSection({
  contentId,
  loginRequired,
}: {
  contentId: number;
  loginRequired: boolean;
}) {
  const t = useTranslations("interaction");
  const locale = useLocale();
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [me, setMe] = useState<{ nickname: string } | null>(null);
  const [body, setBody] = useState("");
  const [guestName, setGuestName] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/comment?contentId=${contentId}`)
      .then((r) => r.json())
      .then((d) => setComments(d?.data ?? []))
      .catch(() => {});
  }, [contentId]);

  useEffect(() => {
    load();
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setMe(d?.data ?? null))
      .catch(() => {});
  }, [load]);

  async function submit() {
    if (!body.trim()) return;
    setSending(true);
    try {
      const r = await fetch("/api/comment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contentId, body, guestName: guestName || undefined }),
      });
      const d = await r.json();
      if (!r.ok || d.ok === false) throw new Error(d.message || "提交失败");
      toast.success(t("pendingReview"));
      setBody("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "提交失败");
    } finally {
      setSending(false);
    }
  }

  const canComment = !loginRequired || !!me;

  return (
    <section className="mt-10 border-t pt-8">
      <h2 className="mb-4 flex items-center gap-2 font-heading text-xl font-semibold">
        <MessageSquare className="h-5 w-5" />
        {t("comment")}({comments.length})
      </h2>

      {canComment ? (
        <div className="mb-8 space-y-3">
          {!me && (
            <Input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder={t("commentGuestName")}
              className="max-w-xs"
              maxLength={30}
            />
          )}
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("commentPlaceholder")}
            rows={3}
            maxLength={1000}
          />
          <div className="flex justify-end">
            <Button onClick={submit} disabled={sending || !body.trim()}>
              {sending ? "…" : t("submitComment")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mb-8 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          <Link href={`/${locale}/login`} className="text-primary underline underline-offset-2">
            {t("commentLoginRequired")}
          </Link>
        </div>
      )}

      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noComments")}</p>
      ) : (
        <ul className="space-y-4">
          {comments.map((c) => (
            <li key={c.id} className="rounded-lg border p-4">
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 font-medium">
                  {c.author}
                  {c.isAuthorReply && (
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      {t("authorBadge")}
                    </span>
                  )}
                </span>
                <time className="text-xs text-muted-foreground">
                  {new Date(c.createdAt).toLocaleString(safeDateLocale(locale))}
                </time>
              </div>
              <p className="whitespace-pre-wrap text-sm">{c.body}</p>
              {(c.replies?.length ?? 0) > 0 && (
                <ul className="mt-3 space-y-3 border-l-2 pl-4">
                  {c.replies!.map((r) => (
                    <li key={r.id}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 text-sm font-medium">
                          {r.author}
                          {r.isAuthorReply && (
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                              {t("authorBadge")}
                            </span>
                          )}
                        </span>
                        <time className="text-xs text-muted-foreground">
                          {new Date(r.createdAt).toLocaleString(safeDateLocale(locale))}
                        </time>
                      </div>
                      <p className="whitespace-pre-wrap text-sm">{r.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
