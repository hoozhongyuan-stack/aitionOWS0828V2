"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiGet } from "@/components/admin/api-client";
import { TablePagination } from "@/components/admin/table-pagination";
import { formatMoney } from "@/lib/utils";
import { Pencil, Plus } from "lucide-react";

/**
 * 商品管理(V4.2,交易模块入口):数据为 Content(product 栏目),本页为专属管理视图;
 * 编辑复用内容编辑器(零重复链路)。
 */
interface ProductRow {
  id: number;
  slug: string;
  status: string;
  coverUrl: string | null;
  priceCents: number | null;
  currency: string | null;
  spu: string | null;
  categoryId: number;
  title: string;
  categoryName: string;
}
interface ListData {
  total: number;
  page: number;
  pageSize: number;
  items: ProductRow[];
  categories: { id: number; translations: { locale: string; name: string }[] }[];
}

const STATUS_BADGE: Record<string, string> = {
  PUBLISHED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  DRAFT: "bg-muted text-muted-foreground",
  OFFLINE: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  SCHEDULED: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
};
const STATUS_LABEL: Record<string, string> = {
  PUBLISHED: "已发布",
  DRAFT: "草稿",
  OFFLINE: "已下架",
  SCHEDULED: "定时",
  PENDING: "待审核",
};

export default function ProductsPage() {
  const [data, setData] = useState<ListData | null>(null);
  const [keyword, setKeyword] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const load = useCallback(() => {
    const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (keyword.trim()) q.set("keyword", keyword.trim());
    if (categoryId) q.set("categoryId", categoryId);
    apiGet<ListData>(`/api/admin/products?${q}`)
      .then(setData)
      .catch(() => toast.error("商品加载失败"));
  }, [keyword, categoryId, page, pageSize]);
  useEffect(load, [load]);

  const catName = (c: { translations: { locale: string; name: string }[] }) =>
    (c.translations.find((t) => t.locale === "zh-CN") ?? c.translations[0])?.name ?? "-";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">商品管理</h1>
          <p className="text-sm text-muted-foreground">
            商品数据与内容体系同源(仅商品类栏目);价格留空 = 仅询盘;编辑复用内容编辑器
          </p>
        </div>
        <Button asChild>
          <Link href="/zh-CN/admin/content/edit/new">
            <Plus className="mr-1 h-4 w-4" />
            新建商品
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="rounded-md border bg-background px-2 py-1.5 text-sm"
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">全部商品栏目</option>
          {(data?.categories ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {catName(c)}
            </option>
          ))}
        </select>
        <Input
          className="w-56"
          placeholder="搜索商品标题…"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setPage(1)}
        />
        <Button size="sm" variant="outline" onClick={() => setPage(1)}>
          查询
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(data?.items ?? []).map((p) => (
          <Card key={p.id} className="overflow-hidden">
            <div className="aspect-[16/9] w-full bg-muted">
              {p.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.coverUrl} alt={p.title} className="h-full w-full object-cover" />
              ) : null}
            </div>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.title}</p>
                  <p className="text-xs text-muted-foreground">{p.categoryName} · {p.slug}</p>
                </div>
                <Badge className={STATUS_BADGE[p.status] ?? ""}>{STATUS_LABEL[p.status] ?? p.status}</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                {p.priceCents != null ? (
                  <span className="font-heading font-bold text-primary">
                    {formatMoney(p.priceCents, p.currency || "USD", "zh-CN")}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">仅询盘</span>
                )}
                {p.spu && <span className="font-mono text-xs text-muted-foreground">SPU: {p.spu}</span>}
              </div>
              <div className="flex justify-end pt-1">
                <Button asChild size="sm" variant="outline">
                  <Link href={`/zh-CN/admin/content/edit/${p.id}`}>
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    编辑
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {(data?.items?.length ?? 0) === 0 && (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          暂无商品;点击右上角「新建商品」并选择商品类栏目
        </div>
      )}

      <TablePagination
        total={data?.total ?? 0}
        page={page}
        pageSize={pageSize}
        onPage={(p) => setPage(p)}
        onPageSize={(n) => {
          setPageSize(n);
          setPage(1);
        }}
      />
    </div>
  );
}
