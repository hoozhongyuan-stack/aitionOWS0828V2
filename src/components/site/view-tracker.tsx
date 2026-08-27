"use client";

import { useEffect } from "react";

/**
 * 阅读量埋点:页面挂载后上报一次。
 * localStorage 一小时窗口去重(服务端另有 IP 限频双保险)。
 */
export function ViewTracker({ contentId }: { contentId: number }) {
  useEffect(() => {
    const key = `viewed:${contentId}`;
    const last = Number(localStorage.getItem(key) || 0);
    if (Date.now() - last < 3600_000) return;
    localStorage.setItem(key, String(Date.now()));
    fetch("/api/interaction/view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contentId }),
    }).catch(() => {});
  }, [contentId]);
  return null;
}
