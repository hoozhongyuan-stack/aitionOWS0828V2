"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet, apiDelete } from "@/components/admin/api-client";
import { routing } from "@/i18n/routing";

/** 后台列表显示:优先站点默认语言,缺失回退首条翻译 */
const DEFAULT_LOCALE = routing.defaultLocale;
function adminTitle(translations: { locale: string; title: string }[], slug: string) {
  return translations.find(t => t.locale === DEFAULT_LOCALE)?.title ?? translations[0]?.title ?? slug;
}
function adminCatName(translations: { locale: string; name: string }[] | undefined, slug: string) {
  return translations?.find(t => t.locale === DEFAULT_LOCALE)?.name ?? translations?.[0]?.name ?? slug;
}
import { Plus, Pencil, Trash2 } from "lucide-react";

/**
 * 内容列表(需求 4.4/4.8):筛选、增删改查入口、状态标识。
 * 互动数据(阅读/赞/转/藏)仅展示,后台不可编辑(测试反馈缺陷8:防止人为篡改真实互动数据;
 * favoriteCount 为 V3.0 新增,与既有三项对称只读)。
 */

interface ContentRow {
  id: number;
  slug: string;
  status: string;
  source: string;
  authorName: string | null;
  viewCount: number;
  likeCount: number;
  shareCount: number;
  favoriteCount: number;
  publishAt: string | null;
  createdAt: string;
  translations: { locale: string; title: string }[];
  category: { id: number; slug: string; translations: { locale: string; name: string }[] };
}
interface ListData {
  total: number;
  page: number;
  pageSize: number;
  items: ContentRow[];
}
interface Category {
  id: number;
  translations: { locale: string; name: string }[];
}

const STATUS_LABEL: Record<string, { text: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  DRAFT: { text: "草稿", variant: "secondary" },
  PUBLISHED: { text: "已发布", variant: "default" },
  OFFLINE: { text: "已下架", variant: "outline" },
  SCHEDULED: { text: "定时发布", variant: "outline" },
  PENDING: { text: "待审核", variant: "destructive" },
  REJECTED: { text: "已驳回", variant: "secondary" },
};

export default function ContentAdminPage() {
  const locale = useLocale();
  const [data, setData] = useState<ListData | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [filter, setFilter] = useState({
    categoryId: "",
    status: "",
    keyword: "",
    dateFrom: "",
    dateTo: "",
    page: 1,
  });

  const load = useCallback(() => {
    const q = new URLSearchParams();
    q.set("page", String(filter.page));
    if (filter.categoryId) q.set("categoryId", filter.categoryId);
    if (filter.status) q.set("status", filter.status);
    if (filter.keyword) q.set("keyword", filter.keyword);
    if (filter.dateFrom) q.set("dateFrom", filter.dateFrom);
    if (filter.dateTo) q.set("dateTo", filter.dateTo);
    apiGet<ListData>(`/api/admin/contents?${q}`)
      .then(setData)
      .catch((e) => toast.error(e.message));
  }, [filter]);

  useEffect(load, [load]);
  useEffect(() => {
    apiGet<Category[]>("/api/admin/categories").then(setCats).catch(() => {});
  }, []);

  async function remove(row: ContentRow) {
    if (!window.confirm(`确认删除「${adminTitle(row.translations, row.slug)}」?此操作不可恢复`)) return;
    try {
      await apiDelete(`/api/admin/contents?id=${row.id}`);
      toast.success("已删除");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">内容管理</h1>
          <p className="text-sm text-muted-foreground">支持草稿/发布/下架/定时发布,多语言编辑。</p>
        </div>
        <Button asChild>
          <Link href={`/${locale}/admin/content/edit/new`}>
            <Plus className="h-4 w-4" /> 新建内容
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={filter.categoryId || "all"}
          onValueChange={(v) => setFilter({ ...filter, categoryId: v === "all" ? "" : v, page: 1 })}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="全部栏目" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部栏目</SelectItem>
            {cats.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.translations[0]?.name ?? `#${c.id}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filter.status || "all"}
          onValueChange={(v) => setFilter({ ...filter, status: v === "all" ? "" : v, page: 1 })}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="全部状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v.text}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={filter.keyword}
          onChange={(e) => setFilter({ ...filter, keyword: e.target.value, page: 1 })}
          placeholder="搜索标题…"
          className="w-56"
        />
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <span>创建时间</span>
          <Input
            type="date"
            value={filter.dateFrom}
            onChange={(e) => setFilter({ ...filter, dateFrom: e.target.value, page: 1 })}
            className="w-36"
          />
          <span>至</span>
          <Input
            type="date"
            value={filter.dateTo}
            onChange={(e) => setFilter({ ...filter, dateTo: e.target.value, page: 1 })}
            className="w-36"
          />
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>标题</TableHead>
            <TableHead>栏目</TableHead>
            <TableHead>作者</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>来源</TableHead>
            <TableHead>阅读/赞/转/藏</TableHead>
            <TableHead>创建时间</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                暂无内容
              </TableCell>
            </TableRow>
          )}
          {data?.items.map((row) => {
            const st = STATUS_LABEL[row.status] ?? { text: row.status, variant: "outline" as const };
            return (
              <TableRow key={row.id}>
                <TableCell className="max-w-64">
                  <div className="truncate font-medium">{adminTitle(row.translations, row.slug)}</div>
                  <div className="truncate font-mono text-xs text-muted-foreground">{row.slug}</div>
                </TableCell>
                <TableCell>{adminCatName(row.category.translations, row.category.slug)}</TableCell>
                <TableCell className="text-sm">{row.authorName ?? "-"}</TableCell>
                <TableCell>
                  <Badge variant={st.variant}>{st.text}</Badge>
                  {row.status === "SCHEDULED" && row.publishAt && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {new Date(row.publishAt).toLocaleString("zh-CN")}
                    </div>
                  )}
                </TableCell>
                <TableCell>{row.source === "UGC" ? <Badge variant="outline">投稿</Badge> : "后台"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {row.viewCount} / {row.likeCount} / {row.shareCount} / {row.favoriteCount}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(row.createdAt).toLocaleDateString("zh-CN")}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/${locale}/admin/content/edit/${row.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(row)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {data && totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={filter.page <= 1}
            onClick={() => setFilter({ ...filter, page: filter.page - 1 })}
          >
            上一页
          </Button>
          <span className="text-muted-foreground">
            {filter.page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={filter.page >= totalPages}
            onClick={() => setFilter({ ...filter, page: filter.page + 1 })}
          >
            下一页
          </Button>
        </div>
      )}
    </div>
  );
}
