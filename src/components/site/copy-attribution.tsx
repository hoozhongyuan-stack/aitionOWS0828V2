"use client";

import type { ReactNode } from "react";

/**
 * 复制带来源(V4.7.4):访客在正文内复制文字时,剪贴板自动追加一行出处 ——
 * 公众号同款机制。只追加、不改写用户复制的内容;正文外(页头/页脚等)的复制不受影响。
 */
export function CopyAttribution({
  site,
  title,
  url,
  children,
}: {
  site: string;
  title: string;
  url: string;
  children: ReactNode;
}) {
  function onCopy(e: React.ClipboardEvent) {
    const selected = window.getSelection()?.toString() ?? "";
    if (!selected.trim()) return;
    const line = `\n\n来源：${site} · ${title}\n${url}`;
    e.clipboardData.setData("text/plain", selected + line);
    e.preventDefault();
  }
  return (
    <div onCopy={onCopy}>
      {children}
    </div>
  );
}
