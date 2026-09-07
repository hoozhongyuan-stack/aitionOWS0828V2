"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/**
 * 商品栏目筛选条(V4.0):关键词 + 价格区间 + 排序。
 * URL searchParams 驱动(q/min/max/sort/page)——服务端过滤保 SEO,链接可分享。
 * 仅商品栏目渲染(父级按 moduleType 控制)。
 */
export function ProductFilterBar({ currency }: { currency: string }) {
  const t = useTranslations("shop");
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [min, setMin] = useState(sp.get("min") ?? "");
  const [max, setMax] = useState(sp.get("max") ?? "");

  function apply(next: { sort?: string }) {
    const params = new URLSearchParams(sp.toString());
    const setOrDel = (key: string, value: string) => {
      if (value) params.set(key, value);
      else params.delete(key);
    };
    setOrDel("q", q.trim());
    setOrDel("min", min.trim());
    setOrDel("max", max.trim());
    if (next.sort !== undefined) setOrDel("sort", next.sort);
    params.delete("page"); // 新筛选回到第一页
    router.push(`${pathname}?${params.toString()}`);
  }

  const activeSort = sp.get("sort") ?? "latest";
  const hasFilter = !!(sp.get("q") || sp.get("min") || sp.get("max") || (sp.get("sort") && sp.get("sort") !== "latest"));

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
      <input
        className="w-44 rounded-md border bg-background px-2 py-1 text-sm"
        placeholder={t("searchKw")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && apply({})}
        aria-label={t("searchKw")}
      />
      <span className="text-sm text-muted-foreground">{t("priceRange")}({currency})</span>
      <input
        className="w-24 rounded-md border bg-background px-2 py-1 text-sm"
        placeholder={t("min")}
        type="number"
        min={0}
        value={min}
        onChange={(e) => setMin(e.target.value)}
        aria-label={t("min")}
      />
      <span className="text-muted-foreground">–</span>
      <input
        className="w-24 rounded-md border bg-background px-2 py-1 text-sm"
        placeholder={t("max")}
        type="number"
        min={0}
        value={max}
        onChange={(e) => setMax(e.target.value)}
        aria-label={t("max")}
      />
      <select
        className="rounded-md border bg-background px-2 py-1 text-sm"
        value={activeSort}
        onChange={(e) => apply({ sort: e.target.value })}
        aria-label={t("sort")}
      >
        <option value="latest">{t("sortLatest")}</option>
        <option value="priceAsc">{t("sortPriceAsc")}</option>
        <option value="priceDesc">{t("sortPriceDesc")}</option>
      </select>
      <Button size="sm" variant="outline" onClick={() => apply({})}>
        {t("apply")}
      </Button>
      {hasFilter && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setQ("");
            setMin("");
            setMax("");
            router.push(pathname);
          }}
        >
          {t("reset")}
        </Button>
      )}
    </div>
  );
}
