"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiGet, apiPost, apiDelete } from "@/components/admin/api-client";
import { sanitizeRichHtml } from "@/lib/sanitize";
import { Check, X, Trash2, Eye, Plus } from "lucide-react";

/**
 * 互动审核中心(需求 4.8):
 * 评论审核(通过/驳回/删除)、投稿审核(预览/通过即发布/驳回)、敏感词库。
 * 审核红线:未通过内容永不出现在前台。
 */

const STATUS_BADGE: Record<string, { text: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  PENDING: { text: "待审核", variant: "destructive" },
  APPROVED: { text: "已通过", variant: "default" },
  REJECTED: { text: "已驳回", variant: "secondary" },
  PUBLISHED: { text: "已发布", variant: "default" },
};

// ---------------- 评论审核 ----------------

interface CommentRow {
  id: number;
  body: string;
  status: string;
  guestName: string | null;
  ip: string | null;
  createdAt: string;
  user: { nickname: string | null; email: string | null } | null;
  content: { slug: string; translations: { locale: string; title: string }[] };
}

function CommentsTab() {
  const [status, setStatus] = useState("PENDING");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [data, setData] = useState<{ total: number; items: CommentRow[] } | null>(null);

  const load = useCallback(() => {
    const q = new URLSearchParams();
    q.set("status", status === "ALL" ? "" : status);
    if (dateFrom) q.set("dateFrom", dateFrom);
    if (dateTo) q.set("dateTo", dateTo);
    apiGet<{ total: number; items: CommentRow[] }>(`/api/admin/ugc/comments?${q}`)
      .then(setData)
      .catch((e) => toast.error(e.message));
  }, [status, dateFrom, dateTo]);
  useEffect(load, [load]);

  async function review(id: number, s: "APPROVED" | "REJECTED") {
    try {
      await apiPost("/api/admin/ugc/comments", { id, status: s });
      toast.success(s === "APPROVED" ? "已通过,前台可见" : "已驳回");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    }
  }
  async function remove(id: number) {
    if (!window.confirm("确认删除该评论?")) return;
    try {
      await apiDelete(`/api/admin/ugc/comments?id=${id}`);
      toast.success("已删除");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>评论审核</CardTitle>
          <CardDescription>共 {data?.total ?? "…"} 条;通过后才在前台展示</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36" />
          <span className="text-sm text-muted-foreground">至</span>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36" />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PENDING">待审核</SelectItem>
              <SelectItem value="APPROVED">已通过</SelectItem>
              <SelectItem value="REJECTED">已驳回</SelectItem>
              <SelectItem value="ALL">全部</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>评论内容</TableHead>
              <TableHead>评论者</TableHead>
              <TableHead>所在内容</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  暂无{status === "PENDING" ? "待审核" : ""}评论
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((c) => {
              const st = STATUS_BADGE[c.status] ?? { text: c.status, variant: "outline" as const };
              return (
                <TableRow key={c.id}>
                  <TableCell className="max-w-72">
                    <p className="line-clamp-2 whitespace-pre-wrap text-sm">{c.body}</p>
                    <span className="text-xs text-muted-foreground">
                      {new Date(c.createdAt).toLocaleString("zh-CN")} · {c.ip ?? "-"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {c.user ? (c.user.nickname || c.user.email) : `${c.guestName || "游客"}(游客)`}
                  </TableCell>
                  <TableCell className="max-w-40 truncate text-sm">
                    <a
                      href={`/zh-CN/article/${c.content.slug}`}
                      target="_blank"
                      className="text-primary hover:underline"
                      rel="noreferrer"
                    >
                      {c.content.translations[0]?.title ?? c.content.slug}
                    </a>
                  </TableCell>
                  <TableCell>
                    <Badge variant={st.variant}>{st.text}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {c.status !== "APPROVED" && (
                      <Button variant="ghost" size="sm" onClick={() => review(c.id, "APPROVED")} title="通过">
                        <Check className="h-4 w-4 text-green-600" />
                      </Button>
                    )}
                    {c.status !== "REJECTED" && (
                      <Button variant="ghost" size="sm" onClick={() => review(c.id, "REJECTED")} title="驳回">
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => remove(c.id)} title="删除">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------- 投稿审核 ----------------

interface SubmissionRow {
  id: number;
  slug: string;
  status: string;
  createdAt: string;
  authorName: string;
  coverUrl: string | null;
  translations: { locale: string; title: string; summary: string | null; body: string }[];
  category: { translations: { name: string }[]; slug: string };
}

function SubmissionsTab() {
  const [status, setStatus] = useState("PENDING");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [data, setData] = useState<{ total: number; items: SubmissionRow[] } | null>(null);
  const [preview, setPreview] = useState<SubmissionRow | null>(null);

  const load = useCallback(() => {
    const q = new URLSearchParams();
    q.set("status", status === "ALL" ? "" : status);
    if (dateFrom) q.set("dateFrom", dateFrom);
    if (dateTo) q.set("dateTo", dateTo);
    apiGet<{ total: number; items: SubmissionRow[] }>(`/api/admin/ugc/submissions?${q}`)
      .then(setData)
      .catch((e) => toast.error(e.message));
  }, [status, dateFrom, dateTo]);
  useEffect(load, [load]);

  async function review(id: number, approve: boolean) {
    try {
      await apiPost("/api/admin/ugc/submissions", { id, approve });
      toast.success(approve ? "已通过并发布" : "已驳回");
      setPreview(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>投稿审核</CardTitle>
          <CardDescription>共 {data?.total ?? "…"} 条;通过后自动发布到对应栏目</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36" />
          <span className="text-sm text-muted-foreground">至</span>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36" />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PENDING">待审核</SelectItem>
              <SelectItem value="PUBLISHED">已发布</SelectItem>
              <SelectItem value="REJECTED">已驳回</SelectItem>
              <SelectItem value="ALL">全部</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>标题</TableHead>
              <TableHead>投稿人</TableHead>
              <TableHead>栏目</TableHead>
              <TableHead>提交时间</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  暂无投稿
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((s) => {
              const st = STATUS_BADGE[s.status] ?? { text: s.status, variant: "outline" as const };
              return (
                <TableRow key={s.id}>
                  <TableCell className="max-w-64 truncate font-medium">
                    {s.translations[0]?.title ?? s.slug}
                  </TableCell>
                  <TableCell>{s.authorName}</TableCell>
                  <TableCell>{s.category.translations[0]?.name ?? s.category.slug}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(s.createdAt).toLocaleDateString("zh-CN")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={st.variant}>{st.text}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button variant="ghost" size="sm" onClick={() => setPreview(s)} title="预览">
                      <Eye className="h-4 w-4" />
                    </Button>
                    {s.status === "PENDING" && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => review(s.id, true)} title="通过并发布">
                          <Check className="h-4 w-4 text-green-600" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => review(s.id, false)} title="驳回">
                          <X className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{preview?.translations[0]?.title}</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {preview.authorName} · {new Date(preview.createdAt).toLocaleString("zh-CN")} ·{" "}
                {preview.category.translations[0]?.name}
              </div>
              {preview.coverUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview.coverUrl} alt="封面" className="w-full rounded-lg" />
              )}
              {preview.translations[0]?.summary && (
                <p className="rounded bg-muted p-3 text-sm">{preview.translations[0].summary}</p>
              )}
              <div
                className="rich-content"
                // 投稿预览来自未信任用户,渲染前消毒,防止 XSS 打管理员会话
                dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(preview.translations[0]?.body ?? "") }}
              />
              {preview.status === "PENDING" && (
                <div className="flex justify-end gap-2 border-t pt-4">
                  <Button variant="outline" onClick={() => review(preview.id, false)}>
                    驳回
                  </Button>
                  <Button onClick={() => review(preview.id, true)}>通过并发布</Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------------- 敏感词 ----------------

function WordsTab() {
  const [words, setWords] = useState<{ id: number; word: string }[]>([]);
  const [input, setInput] = useState("");

  const load = useCallback(() => {
    apiGet<{ id: number; word: string }[]>("/api/admin/ugc/words")
      .then(setWords)
      .catch((e) => toast.error(e.message));
  }, []);
  useEffect(load, [load]);

  async function add() {
    const list = input
      .split(/[\n,,、]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!list.length) return;
    try {
      await apiPost("/api/admin/ugc/words", { words: list });
      toast.success(`已添加 ${list.length} 个敏感词`);
      setInput("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "添加失败");
    }
  }

  async function remove(id: number) {
    try {
      await apiDelete(`/api/admin/ugc/words?id=${id}`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>敏感词库({words.length})</CardTitle>
        <CardDescription>评论、投稿、表单提交命中敏感词将被拒绝,降低审核压力</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入敏感词,多个用逗号分隔"
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <Button onClick={add}>
            <Plus className="h-4 w-4" /> 添加
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {words.map((w) => (
            <span key={w.id} className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm">
              {w.word}
              <button onClick={() => remove(w.id)} className="text-muted-foreground hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {words.length === 0 && <span className="text-sm text-muted-foreground">词库为空</span>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function UgcAdminPage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">互动审核</h1>
        <p className="text-sm text-muted-foreground">所有 UGC 内容先审后发;互动总开关见「功能设置」。</p>
      </div>
      <Tabs defaultValue="comments">
        <TabsList>
          <TabsTrigger value="comments">评论审核</TabsTrigger>
          <TabsTrigger value="submissions">投稿审核</TabsTrigger>
          <TabsTrigger value="words">敏感词</TabsTrigger>
        </TabsList>
        <TabsContent value="comments">
          <CommentsTab />
        </TabsContent>
        <TabsContent value="submissions">
          <SubmissionsTab />
        </TabsContent>
        <TabsContent value="words">
          <WordsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
