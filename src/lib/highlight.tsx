import type { ReactNode } from "react";

/**
 * 关键词高亮(V4.7.2)。
 *
 * 搜索页需要把命中的关键词标出来。实现上**按切片返回 React 节点**,
 * 绝不拼接 HTML 字符串(不碰 dangerouslySetInnerHTML —— 那样会重新打开 XSS 面)。
 * 匹配不区分英文大小写,保留原文大小写;空关键词或未命中时原样返回。
 */
export function highlightText(text: string | null | undefined, keyword: string): ReactNode {
  const src = text ?? "";
  const kw = keyword.trim();
  if (!src || !kw) return src;

  const lowerSrc = src.toLowerCase();
  const lowerKw = kw.toLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  let idx = lowerSrc.indexOf(lowerKw);

  while (idx !== -1) {
    if (idx > cursor) parts.push(src.slice(cursor, idx));
    parts.push(
      <mark key={`${idx}-${parts.length}`} className="rounded bg-primary/15 px-0.5 text-foreground">
        {src.slice(idx, idx + kw.length)}
      </mark>
    );
    cursor = idx + kw.length;
    idx = lowerSrc.indexOf(lowerKw, cursor);
  }
  if (cursor < src.length) parts.push(src.slice(cursor));
  return parts.length > 0 ? parts : src;
}
