"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, apiPost, apiDelete, apiUpload } from "@/components/admin/api-client";
import { Trash2, Upload, FileVideo, File as FileIcon, Check } from "lucide-react";

/** 文件管理(需求 4.7):网格浏览、上传、alt 语义编辑(SEO)、删除 */

interface MediaRow {
  id: number;
  url: string;
  filename: string;
  mime: string;
  size: number;
  alt: string | null;
  createdAt: string;
}
interface ListData {
  total: number;
  page: number;
  pageSize: number;
  items: MediaRow[];
}

export default function MediaAdminPage() {
  const [data, setData] = useState<ListData | null>(null);
  const [page, setPage] = useState(1);
  const [mime, setMime] = useState("all");
  const [altEdit, setAltEdit] = useState<Record<number, string>>({});

  const load = useCallback(() => {
    const q = new URLSearchParams({ page: String(page) });
    if (mime !== "all") q.set("mime", mime);
    apiGet<ListData>(`/api/admin/media?${q}`)
      .then(setData)
      .catch((e) => toast.error(e.message));
  }, [page, mime]);
  // 文件选择框按后台"上传允许类型"过滤,从源头避免选了必被拒的文件
  const [accept, setAccept] = useState("image/*,video/mp4");
  useEffect(() => {
    apiGet<{ allowedTypes?: string[] }>("/api/admin/settings/upload")
      .then((cfg) => {
        if (cfg.allowedTypes?.length) setAccept(cfg.allowedTypes.join(","));
      })
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    // 逐文件真实结果汇总:此前无条件弹"上传完成",单个失败(类型/超限)被成功提示掩盖
    const failed: string[] = [];
    let ok = 0;
    for (const f of files) {
      try {
        await apiUpload(f);
        ok++;
      } catch (err) {
        failed.push(`${f.name}:${err instanceof Error ? err.message : "上传失败"}`);
      }
    }
    if (ok > 0) {
      toast.success(`上传成功 ${ok} 个文件`);
    }
    if (failed.length > 0) {
      toast.error(`${failed.length} 个文件上传失败`, {
        description: failed.join("；"),
        duration: 8000,
      });
    }
    if (ok > 0) load();
  }

  async function saveAlt(row: MediaRow) {
    const alt = altEdit[row.id];
    if (alt === undefined || alt === (row.alt ?? "")) return;
    try {
      await apiPost("/api/admin/media", { id: row.id, alt });
      toast.success("alt 已更新");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  }

  async function remove(row: MediaRow) {
    if (!window.confirm(`确认删除文件「${row.filename}」?已引用它的页面会显示为失效图`)) return;
    try {
      await apiDelete(`/api/admin/media?id=${row.id}`);
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
          <h1 className="text-2xl font-semibold">文件管理</h1>
          <p className="text-sm text-muted-foreground">
            共 {data?.total ?? "…"} 个文件,全部存储于服务器本地 uploads/ 目录;alt 用于图片 SEO 语义。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={mime} onValueChange={(v) => { setMime(v); setPage(1); }}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类型</SelectItem>
              <SelectItem value="image">图片</SelectItem>
              <SelectItem value="video">视频</SelectItem>
              <SelectItem value="application">文档</SelectItem>
            </SelectContent>
          </Select>
          <label>
              <input type="file" multiple accept={accept} className="hidden" onChange={upload} />
            <Button asChild>
              <span>
                <Upload className="h-4 w-4" /> 上传文件
              </span>
            </Button>
          </label>
        </div>
      </div>

      {data?.items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-16 text-center text-muted-foreground">暂无文件</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data?.items.map((m) => (
            <div key={m.id} className="overflow-hidden rounded-lg border bg-card">
              {m.mime.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.url} alt={m.alt ?? m.filename} loading="lazy" className="aspect-video w-full object-cover" />
              ) : (
                <div className="flex aspect-video w-full items-center justify-center bg-muted">
                  {m.mime.startsWith("video/") ? (
                    <FileVideo className="h-8 w-8 text-muted-foreground" />
                  ) : (
                    <FileIcon className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
              )}
              <div className="space-y-2 p-3">
                <div className="truncate text-xs text-muted-foreground" title={m.filename}>
                  {m.filename} · {(m.size / 1024).toFixed(0)}KB
                </div>
                <div className="flex gap-1">
                  <Input
                    value={altEdit[m.id] ?? m.alt ?? ""}
                    onChange={(e) => setAltEdit({ ...altEdit, [m.id]: e.target.value })}
                    placeholder="alt 语义描述"
                    className="h-7 text-xs"
                  />
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => saveAlt(m)} title="保存 alt">
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(m)} title="删除">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            上一页
          </Button>
          <span className="text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            下一页
          </Button>
        </div>
      )}
    </div>
  );
}
