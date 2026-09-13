"use client";

import { useCallback, useEffect, useState } from "react";
import { adminName } from "@/lib/admin-display";
import Link from "next/link";
import { toast } from "sonner";
import { confirmDialog } from "@/components/admin/dialogs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet } from "@/components/admin/api-client";
import { useBatchSelection } from "@/components/admin/use-batch-selection";
import { BatchActionBar, runBatchAction } from "@/components/admin/batch-action-bar";
import { TablePagination } from "@/components/admin/table-pagination";
import { formatMoney } from "@/lib/utils";
import { Pencil, Plus, List, LayoutGrid } from "lucide-react";

/**
 * 商品管理(V4.2,交易模块入口):数据为 Content(product 栏目),本页为专属管理视图;
 * 编辑复用内容编辑器(零重复链路)。
 * V4.4.0:新增「列表视图」并设为默认——网格一排 3 个一屏只能看 3~6 条,
 * 而管理场景(找/改/核对)更需要信息密度;偏好记在本地,用户切回网格也会被记住。
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
  updatedAt: string; // V4.4.0
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

/** V4.4.0 视图模式;默认列表(信息密度是一排 3 个网格的 3~5 倍) */
type ViewMode = "list" | "grid";
const VIEW_KEY = "aition_admin_product_view";

/** 本地时间 YYYY-MM-DD HH:mm(不涉 Intl,无 locale 风险) */
function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function ProductsPage() {
  const [data, setData] = useState<ListData | null>(null);
  const [keyword, setKeyword] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  // V4.4.0 批量操作(商品即内容:数据同源,复用内容批量端点)
  const batch = useBatchSelection<ProductRow>();

  // 偏好记忆:挂载后再读 localStorage(SSR 期无 window,不能放 useState 初始化里)
  useEffect(() => {
    const saved = window.localStorage.getItem(VIEW_KEY);
    if (saved === "list" || saved === "grid") setViewMode(saved);
  }, []);
  const switchView = (v: ViewMode) => {
    setViewMode(v);
    window.localStorage.setItem(VIEW_KEY, v);
  };

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
    adminName(c.translations);

  /** V4.4.0 批量动作:商品是 Content(product 栏目),后端复用内容批量端点 */
  async function doBatch(action: string) {
    if (action === "delete" && !await confirmDialog({ title: `确认删除选中的 ${batch.count} 件商品?此操作不可恢复`, destructive: true })) return;
    try {
      const summary = await runBatchAction("/api/admin/contents/batch", Array.from(batch.selected), action);
      toast.success(summary);
      batch.clear(); // 操作完成后清空选择(避免残留旧选中,误伤下一批)
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "批量操作失败");
    }
  }

  /** 价格单元格(网格与列表共用同一显示规则:无价 = 仅询盘) */
  const priceCell = (p: ProductRow, size: "sm" | "md") =>
    p.priceCents != null ? (
      <span className={(size === "sm" ? "text-sm " : "") + "font-heading font-bold text-primary"}>
        {formatMoney(p.priceCents, p.currency || "USD", "zh-CN")}
      </span>
    ) : (
      <span className="text-xs text-muted-foreground">仅询盘</span>
    );

  const items = data?.items ?? [];

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
            batch.clear();
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
          onChange={(e) => {
            batch.clear();
            setKeyword(e.target.value);
          }}
          onKeyDown={(e) => e.key === "Enter" && setPage(1)}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            batch.clear();
            setPage(1);
          }}
        >
          查询
        </Button>

        {/* V4.4.0 视图切换(默认列表,偏好本地记忆) */}
        <div className="ml-auto flex items-center gap-0.5 rounded-md border p-0.5">
          <Button
            size="sm"
            variant={viewMode === "list" ? "secondary" : "ghost"}
            className="h-7 px-2"
            onClick={() => switchView("list")}
            title="列表视图（信息密度高）"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            className="h-7 px-2"
            onClick={() => switchView("grid")}
            title="网格视图（大图浏览）"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <BatchActionBar count={batch.count} onClear={batch.clear}>
        <Button size="sm" variant="outline" onClick={() => doBatch("publish")}>
          批量发布
        </Button>
        <Button size="sm" variant="outline" onClick={() => doBatch("offline")}>
          批量下架
        </Button>
        <Button size="sm" variant="outline" onClick={() => doBatch("draft")}>
          批量转草稿
        </Button>
        <Button size="sm" variant="outline" onClick={() => doBatch("delete")}>
          批量删除
        </Button>
      </BatchActionBar>

      {viewMode === "list" ? (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary align-middle"
                    checked={batch.allSelected(items)}
                    ref={(el) => {
                      if (el) el.indeterminate = batch.someSelected(items);
                    }}
                    onChange={() => batch.toggleAll(items)}
                    aria-label="全选本页"
                  />
                </TableHead>
                <TableHead className="w-14" />
                <TableHead>名称</TableHead>
                <TableHead className="w-28">栏目</TableHead>
                <TableHead className="w-32">价格</TableHead>
                <TableHead className="w-32">SPU</TableHead>
                <TableHead className="w-20">状态</TableHead>
                <TableHead className="w-32">更新时间</TableHead>
                <TableHead className="w-16 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="w-10 py-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary align-middle"
                      checked={batch.selected.has(p.id)}
                      onChange={() => batch.toggle(p.id)}
                      aria-label="选择此商品"
                    />
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="h-10 w-10 overflow-hidden rounded bg-muted">
                      {p.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.coverUrl} alt="" className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="max-w-72 truncate font-medium" title={p.title}>
                      {p.title}
                    </div>
                    <div className="max-w-72 truncate font-mono text-xs text-muted-foreground">{p.slug}</div>
                  </TableCell>
                  <TableCell className="py-2 text-sm text-muted-foreground">{p.categoryName}</TableCell>
                  <TableCell className="py-2">{priceCell(p, "sm")}</TableCell>
                  <TableCell className="py-2 font-mono text-xs text-muted-foreground">{p.spu ?? "—"}</TableCell>
                  <TableCell className="py-2">
                    <Badge className={STATUS_BADGE[p.status] ?? ""}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">{fmtTime(p.updatedAt)}</TableCell>
                  <TableCell className="py-2 text-right">
                    <Button asChild size="sm" variant="ghost" title="编辑">
                      <Link href={`/zh-CN/admin/content/edit/${p.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <Card key={p.id} className="overflow-hidden">
              <div className="relative">
                <div className="aspect-[16/9] w-full bg-muted">
                  {p.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.coverUrl} alt={p.title} className="h-full w-full object-cover" />
                  ) : null}
                </div>
                {/* V4.4.0 批量选择:卡片左上角(半透明底,任何封面图上都可见) */}
                <label className="absolute left-2 top-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded bg-background/85 shadow-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={batch.selected.has(p.id)}
                    onChange={() => batch.toggle(p.id)}
                    aria-label="选择此商品"
                  />
                </label>
              </div>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.categoryName} · {p.slug}
                    </p>
                  </div>
                  <Badge className={STATUS_BADGE[p.status] ?? ""}>
                    {STATUS_LABEL[p.status] ?? p.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  {priceCell(p, "md")}
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
      )}
      {items.length === 0 && (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          暂无商品;点击右上角「新建商品」并选择商品类栏目
        </div>
      )}

      <TablePagination
        total={data?.total ?? 0}
        page={page}
        pageSize={pageSize}
        onPage={(p) => {
          batch.clear();
          setPage(p);
        }}
        onPageSize={(n) => {
          batch.clear();
          setPageSize(n);
          setPage(1);
        }}
      />
    </div>
  );
}
