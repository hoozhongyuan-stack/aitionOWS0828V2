"use client";

import { useCallback, useEffect, useState } from "react";
import { adminName, adminTitle as adminTitleShared } from "@/lib/admin-display";
import Link from "next/link";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { confirmDialog } from "@/components/admin/dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet, apiDelete, apiPatch } from "@/components/admin/api-client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { TablePagination } from "@/components/admin/table-pagination";
import { useBatchSelection } from "@/components/admin/use-batch-selection";
import { BatchActionBar, runBatchAction } from "@/components/admin/batch-action-bar";

/** 后台列表显示:优先站点默认语言,缺失回退首条翻译 */
function adminTitle(translations: { locale: string; title: string }[], slug: string) {
  return adminTitleShared(translations, slug);
}
function adminCatName(translations: { locale: string; name: string }[] | undefined, slug: string) {
  return adminName(translations, slug);
}
import { Plus, Pencil, Trash2, CalendarClock, ExternalLink } from "lucide-react";

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
  category: {
    id: number;
    slug: string;
    translations: { locale: string; name: string }[];
    /** 列表接口实际返回（预览链接需要它区分 /article 与 /product 前缀） */
    moduleType?: string;
  };
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

/** Date → date 输入框的 YYYY-MM-DD（本机时区） */
function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * 定时时间用「日期 + 24 小时制下拉」而非 type="datetime-local"——
 * 后者的 12/24 小时制式由浏览器 locale 决定（英文环境会出现 AM/PM），拆开后完全可控。
 */
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = ["00", "15", "30", "45"];

/** 定时预览文案：2026-09-15（周二）09:00 —— 提交前让用户确认到具体日期与星期 */
function formatSchedulePreview(date: string, hour: string, minute: string): string {
  const d = new Date(`${date}T${hour}:${minute}:00`);
  if (Number.isNaN(d.getTime())) return "（时间无效）";
  const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()];
  return `${date}（${weekday}）${hour}:${minute}`;
}

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
    pageSize: 10, // V4.0.2:默认 10,可 50/100
  });

  // V4.4.0 批量操作(内容与商品同源,复用内容批量端点)
  const batch = useBatchSelection<ContentRow>();
  const clearBatch = batch.clear;

  const load = useCallback(() => {
    clearBatch(); // 翻页/筛选/搜索变化时清空选择,避免"选中了看不见的项"后误删
    const q = new URLSearchParams();
    q.set("page", String(filter.page));
    q.set("pageSize", String(filter.pageSize));
    if (filter.categoryId) q.set("categoryId", filter.categoryId);
    if (filter.status) q.set("status", filter.status);
    if (filter.keyword) q.set("keyword", filter.keyword);
    if (filter.dateFrom) q.set("dateFrom", filter.dateFrom);
    if (filter.dateTo) q.set("dateTo", filter.dateTo);
    apiGet<ListData>(`/api/admin/contents?${q}`)
      .then(setData)
      .catch((e) => toast.error(e.message));
  }, [filter, clearBatch]);

  useEffect(load, [load]);
  useEffect(() => {
    apiGet<Category[]>("/api/admin/categories").then(setCats).catch(() => {});
  }, []);

  async function remove(row: ContentRow) {
    if (!(await confirmDialog({ title: `确认删除「${adminTitle(row.translations, row.slug)}」?此操作不可恢复`, destructive: true }))) return;
    try {
      await apiDelete(`/api/admin/contents?id=${row.id}`);
      toast.success("已删除");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  // ── 列表页「定制发布」(V4.3.0)：不进编辑页即可改发布状态与排期 ──
  const [scheduleRow, setScheduleRow] = useState<ContentRow | null>(null);
  const [scheduleAction, setScheduleAction] = useState<"publish" | "schedule" | "draft">("publish");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleHour, setScheduleHour] = useState("09");
  const [scheduleMinute, setScheduleMinute] = useState("00");
  const [scheduling, setScheduling] = useState(false);

  /** 当前选择的定时时间（日期未选或非法时返回 null） */
  function pickedScheduleAt(): Date | null {
    if (!scheduleDate) return null;
    const d = new Date(`${scheduleDate}T${scheduleHour}:${scheduleMinute}:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function openSchedule(row: ContentRow) {
    setScheduleRow(row);
    setScheduleAction(row.status === "SCHEDULED" ? "schedule" : "publish");
    // 回填：已有定时取原值；否则默认「明天此刻」，省去从头选
    const d = row.publishAt ? new Date(row.publishAt) : new Date(Date.now() + 24 * 3600 * 1000);
    setScheduleDate(toDateInput(d));
    setScheduleHour(String(d.getHours()).padStart(2, "0"));
    setScheduleMinute(String(Math.floor(d.getMinutes() / 15) * 15).padStart(2, "0"));
  }

  async function submitSchedule() {
    if (!scheduleRow) return;
    let publishAtIso: string | null = null;
    if (scheduleAction === "schedule") {
      const at = pickedScheduleAt();
      if (!at) {
        toast.error("请选择发布日期");
        return;
      }
      if (at.getTime() <= Date.now()) {
        toast.error("发布时间必须晚于当前时间");
        return;
      }
      publishAtIso = at.toISOString();
    }
    setScheduling(true);
    try {
      await apiPatch("/api/admin/contents/schedule", {
        id: scheduleRow.id,
        action: scheduleAction,
        publishAt: publishAtIso,
      });
      toast.success("发布状态已更新");
      setScheduleRow(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setScheduling(false);
    }
  }

  /** V4.4.0 批量动作:发布/下架/转草稿/删除(删除前二次确认) */
  async function doBatch(action: string) {
    if (action === "delete" && !(await confirmDialog({ title: `确认删除选中的 ${batch.count} 项?此操作不可恢复`, destructive: true }))) return;
    try {
      const summary = await runBatchAction("/api/admin/contents/batch", Array.from(batch.selected), action);
      toast.success(summary);
      clearBatch();
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "批量操作失败");
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
                {adminName(c.translations, `#${c.id}`)}
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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary align-middle"
                checked={batch.allSelected(data?.items ?? [])}
                ref={(el) => {
                  if (el) el.indeterminate = batch.someSelected(data?.items ?? []);
                }}
                onChange={() => batch.toggleAll(data?.items ?? [])}
                aria-label="全选本页"
              />
            </TableHead>
            <TableHead>标题</TableHead>
            <TableHead>栏目</TableHead>
            <TableHead>作者</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>来源</TableHead>
            <TableHead>阅读/赞/转/藏</TableHead>
            <TableHead>创建时间</TableHead>
            <TableHead>发布时间</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                暂无内容
              </TableCell>
            </TableRow>
          )}
          {data?.items.map((row) => {
            const st = STATUS_LABEL[row.status] ?? { text: row.status, variant: "outline" as const };
            return (
              <TableRow key={row.id}>
                <TableCell className="w-10">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary align-middle"
                    checked={batch.selected.has(row.id)}
                    onChange={() => batch.toggle(row.id)}
                    aria-label="选择此项"
                  />
                </TableCell>
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
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {row.publishAt ? (
                    <span className={row.status === "SCHEDULED" ? "text-foreground" : ""}>
                      {new Date(row.publishAt).toLocaleString("zh-CN", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                  ) : row.status === "PUBLISHED" ? (
                    <span className="text-xs">（立即发布）</span>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => openSchedule(row)} title="定制发布">
                    <CalendarClock className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" asChild title="前台预览">
                    <a
                      href={`/${locale}/${row.category.moduleType === "product" ? "product" : "article"}/${row.slug}?preview=1`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
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

      {/* ── 定制发布弹窗(V4.3.0)：立即发布 / 定时发布 / 转回草稿 ── */}
      <Dialog open={!!scheduleRow} onOpenChange={(o) => !o && setScheduleRow(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>定制发布</DialogTitle>
            <DialogDescription className="truncate">
              {scheduleRow ? adminTitle(scheduleRow.translations, scheduleRow.slug) : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>发布方式</Label>
              <Select value={scheduleAction} onValueChange={(v) => setScheduleAction(v as typeof scheduleAction)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="publish">立即发布（对访客与搜索引擎可见）</SelectItem>
                  <SelectItem value="schedule">定时发布（到点自动上线）</SelectItem>
                  <SelectItem value="draft">转回草稿（不公开）</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {scheduleAction === "schedule" && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="schedule-date">发布时间</Label>
                  {/* V4.6.2:日期独占一行、时/分并排一行——修复窄弹窗下三元素挤压重叠 */}
                  <Input
                    id="schedule-date"
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className="w-full"
                  />
                  <div className="flex gap-2">
                    <Select value={scheduleHour} onValueChange={setScheduleHour}>
                      <SelectTrigger className="w-24" aria-label="小时">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {HOURS.map((h) => (
                          <SelectItem key={h} value={h}>
                            {h} 时
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={scheduleMinute} onValueChange={setScheduleMinute}>
                      <SelectTrigger className="w-24" aria-label="分钟">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MINUTES.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m} 分
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {scheduleDate && (
                  <p className="rounded-md bg-muted px-3 py-2 text-sm">
                    将于{" "}
                    <span className="font-medium">
                      {formatSchedulePreview(scheduleDate, scheduleHour, scheduleMinute)}
                    </span>{" "}
                    自动发布
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  到点由官网自动发布，不依赖你的电脑开机；时间需晚于当前。
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleRow(null)} disabled={scheduling}>
              取消
            </Button>
            <Button onClick={submitSchedule} disabled={scheduling}>
              {scheduling ? "处理中…" : "确定"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          <TablePagination
        total={data?.total ?? 0}
        page={filter.page}
        pageSize={filter.pageSize}
        onPage={(p) => setFilter({ ...filter, page: p })}
        onPageSize={(n) => setFilter({ ...filter, pageSize: n, page: 1 })}
      />
    </div>
  );
}

