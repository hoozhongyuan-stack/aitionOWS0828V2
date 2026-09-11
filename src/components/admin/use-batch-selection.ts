"use client";

import { useCallback, useState } from "react";

/**
 * 批量选择状态(V4.4.0)。五个管理列表共用。
 *
 * 约定:**翻页或改筛选时由调用方 clear()** —— 否则会出现"选中了看不见的项"
 * 的误操作(比如在第 2 页选中后翻回第 1 页,点批量删除会删掉没看见的那些)。
 */
export function useBatchSelection<T extends { id: number }>() {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggle = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** 表头全选:已全选则取消,否则选中当前页全部 */
  const toggleAll = useCallback((rows: T[]) => {
    setSelected((prev) => {
      const ids = rows.map((r) => r.id);
      const all = ids.length > 0 && ids.every((id) => prev.has(id));
      return all ? new Set<number>() : new Set(ids);
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set<number>()), []);

  /** 当前页是否已全选(表头勾选态) */
  const allSelected = (rows: T[]) => rows.length > 0 && rows.every((r) => selected.has(r.id));
  /** 部分选中(表头 indeterminate 态) */
  const someSelected = (rows: T[]) => rows.some((r) => selected.has(r.id)) && !allSelected(rows);

  return { selected, count: selected.size, toggle, toggleAll, clear, allSelected, someSelected };
}

export type BatchSelection<T extends { id: number }> = ReturnType<typeof useBatchSelection<T>>;
