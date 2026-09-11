"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/components/admin/api-client";
import { X } from "lucide-react";

/**
 * 批量操作栏(V4.4.0):选中项 > 0 时出现,固定在列表上方(不随滚动丢失)。
 * 只提供"已选 N 项 + 取消选择"这层外壳;具体动作按钮由各页面传入——
 * 各资源的可用动作不同(内容可发布/下架、用户只能启用/禁用、投稿只能审核),
 * 把差异留在页面,把一致性留在壳里。
 */
export function BatchActionBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
      <span className="text-sm font-medium">已选 {count} 项</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      <Button size="sm" variant="ghost" className="ml-auto" onClick={onClear}>
        <X className="mr-1 h-3.5 w-3.5" />
        取消选择
      </Button>
    </div>
  );
}

export interface BatchResponse {
  ok: number[];
  skipped: { id: number; reason: string }[];
  /** 服务端计算的结果摘要(前端直接展示,避免两端各算一遍) */
  summary: string;
}

/**
 * 执行一次批量动作。
 * @returns 结果摘要(成功/跳过与原因),调用方负责 toast 与刷新列表
 */
export async function runBatchAction(url: string, ids: number[], action: string): Promise<string> {
  const res = await apiPost<BatchResponse>(url, { ids, action });
  return res.summary ?? `成功 ${res.ok?.length ?? 0} 项`;
}
