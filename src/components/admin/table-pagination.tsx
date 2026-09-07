"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * 后台列表统一分页器(V4.0.2):右下角,「共 N 条 · 每页 [10|50|100] · 上下页/页码」。
 * 四个列表页(订单/内容/注册用户/互动审核)共用;条数切换后由调用方回第 1 页。
 */
export function TablePagination({
  total,
  page,
  pageSize,
  onPage,
  onPageSize,
  pageSizes = [10, 50, 100],
}: {
  total: number;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  pageSizes?: number[];
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 text-sm text-muted-foreground">
      <span>共 {total} 条</span>
      <div className="flex items-center gap-1.5">
        <span>每页</span>
        <Select
          value={String(pageSize)}
          onValueChange={(v) => onPageSize(Number(v))}
        >
          <SelectTrigger className="h-8 w-[72px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizes.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} 条
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-1">
        <Button size="icon" variant="outline" className="h-8 w-8" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="上一页">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-1">
          第 {page} / {totalPages} 页
        </span>
        <Button size="icon" variant="outline" className="h-8 w-8" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="下一页">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
