"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGet, apiPost, apiDelete } from "@/components/admin/api-client";
import { TablePagination } from "@/components/admin/table-pagination";
import { Check, FolderPlus, Upload, Video } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 文件管理(V4.1.1 改版,对齐「仓库式」参考形态):
 * 左侧文件夹列表(显示文件数)+ 顶部类型 Tab + 缩略图网格(改名/分组/删除)+ 批量勾选 + 分页。
 */

type MediaRow = {
  id: number;
  path: string;
  filename: string;
  mime: string;
  size: number;
  folderId: number | null;
  width?: number | null;
  height?: number | null;
};

type FolderNode = {
  id: number;
  name: string;
  parentId: number | null;
  children: { id: number; name: string }[];
};

type ListData = {
  folders: FolderNode[];
  items: MediaRow[];
  total: number;
  page: number;
  pageSize: number;
};

type MimeKey = "all" | "image" | "video" | "document";

const MIME_TABS: { key: MimeKey; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "image", label: "图片" },
  { key: "video", label: "视频" },
  { key: "document", label: "文档" },
];

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}

export default function MediaPage() {
  const [data, setData] = useState<ListData | null>(null);
  const [folder, setFolder] = useState<string>(""); // ""=未分类;数字串=文件夹 id
  const [mime, setMime] = useState<MimeKey>("all");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (folder !== "") q.set("folderId", folder);
    if (mime !== "all") q.set("mime", mime === "document" ? "application" : mime);
    if (keyword.trim()) q.set("keyword", keyword.trim());
    try {
      const d = await apiGet<ListData>(`/api/admin/media?${q}`);
      setData(d);
    } catch {
      toast.error("文件加载失败");
    }
  }, [page, pageSize, folder, mime, keyword]);

  useEffect(() => {
    void load();
  }, [load]);

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.set("file", file);
      if (folder !== "") form.set("folderId", folder);
      try {
        const r = await fetch("/api/admin/upload", { method: "POST", body: form });
        const d = await r.json();
        if (!r.ok || !d.ok) throw new Error(d.message || "上传失败");
      } catch (e) {
        toast.error(`${file.name}: ${e instanceof Error ? e.message : "上传失败"}`);
      }
    }
    toast.success("上传完成");
    setPage(1);
    load();
  }

  async function folderAction(body: Record<string, unknown>, successMsg: string) {
    try {
      await apiPost("/api/admin/media", body);
      toast.success(successMsg);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    }
  }

  async function renameFile(row: MediaRow) {
    const name = window.prompt("修改文件名(展示名)", row.filename);
    if (!name?.trim()) return;
    try {
      await apiPost("/api/admin/media", { id: row.id, alt: name.trim() });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "失败");
    }
  }

  async function moveOne(row: MediaRow) {
    const fid = window.prompt("目标文件夹 ID(空=未分类)", row.folderId ? String(row.folderId) : "");
    if (fid === null) return;
    const n = fid.trim() === "" ? null : Number(fid);
    if (n !== null && !Number.isInteger(n)) {
      toast.error("文件夹 ID 非法");
      return;
    }
    try {
      await apiPost("/api/admin/media", { action: "moveAssets", ids: [row.id], folderId: n });
      toast.success("已修改分组");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "失败");
    }
  }

  async function deleteFiles(ids: number[]) {
    if (!window.confirm(`确认删除 ${ids.length} 个文件?该操作不可恢复`)) return;
    for (const id of ids) {
      try {
        await apiDelete(`/api/admin/media?id=${id}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "删除失败");
      }
    }
    toast.success("已删除");
    setSelected(new Set());
    load();
  }

  async function moveMany(ids: number[]) {
    const fid = window.prompt(`批量移动 ${ids.length} 个文件,目标文件夹 ID(空=未分类)`);
    if (fid === null) return;
    const n = fid.trim() === "" ? null : Number(fid);
    if (n !== null && !Number.isInteger(n)) {
      toast.error("文件夹 ID 非法");
      return;
    }
    try {
      await apiPost("/api/admin/media", { action: "moveAssets", ids, folderId: n });
      toast.success("已修改分组");
      setSelected(new Set());
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "失败");
    }
  }

  const items = data?.items ?? [];
  const allChecked = items.length > 0 && items.every((i) => selected.has(i.id));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">文件管理</h1>
        <label>
          <input type="file" multiple className="hidden" onChange={(e) => uploadFiles(e.target.files)} />
          <Button asChild>
            <span>
              <Upload className="h-4 w-4" />
              上传文件
            </span>
          </Button>
        </label>
      </div>

      <Input
        className="max-w-sm"
        placeholder="搜索文件名…"
        value={keyword}
        onChange={(e) => {
          setKeyword(e.target.value);
          setPage(1);
        }}
      />

      <div className="flex gap-4">
        {/* 左侧文件夹列表 */}
        <aside className="w-44 shrink-0 space-y-1">
          <button
            className={cn(
              "block w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
              folder === "" && "bg-accent font-medium"
            )}
            onClick={() => {
              setFolder("");
              setPage(1);
              setSelected(new Set());
            }}
          >
            <span className="flex items-center justify-between">
              <span>未分类</span>
              <span className="text-xs text-muted-foreground">({data?.total ?? 0})</span>
            </span>
          </button>
          {(data?.folders ?? []).map((f) => (
            <div key={f.id}>
              <button
                className={cn(
                  "block w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                  folder === String(f.id) && "bg-accent font-medium"
                )}
                onClick={() => {
                  setFolder(String(f.id));
                  setPage(1);
                  setSelected(new Set());
                }}
              >
                <span className="flex items-center justify-between">
                  <span className="truncate">{f.name}</span>
                  <span className="text-xs text-muted-foreground">({f.children.length + 1})</span>
                </span>
              </button>
              {f.children.map((c) => (
                <button
                  key={c.id}
                  className={cn(
                    "block w-full truncate rounded-md py-1.5 pl-7 pr-3 text-left text-sm text-muted-foreground transition-colors hover:bg-accent",
                    folder === String(c.id) && "bg-accent font-medium text-foreground"
                  )}
                  onClick={() => {
                    setFolder(String(c.id));
                    setPage(1);
                    setSelected(new Set());
                  }}
                >
                  └ {c.name}
                </button>
              ))}
            </div>
          ))}
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 w-full justify-start text-xs"
            onClick={async () => {
              const name = window.prompt("新建文件夹名称(一级)");
              if (!name?.trim()) return;
              await folderAction({ action: "createFolder", name: name.trim(), parentId: null }, "已创建");
            }}
          >
            <FolderPlus className="mr-1 h-3.5 w-3.5" />
            新建分组
          </Button>
          {folder !== "" && Number(folder) > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="w-full justify-start text-xs"
              onClick={async () => {
                const name = window.prompt("子文件夹名称(二级)");
                if (!name?.trim()) return;
                await folderAction({ action: "createFolder", name: name.trim(), parentId: Number(folder) }, "已创建");
              }}
            >
              + 子文件夹
            </Button>
          )}
        </aside>

        {/* 右侧:Tab + 网格 + 批量操作条 */}
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center gap-1 border-b">
            {MIME_TABS.map((t) => (
              <button
                key={t.key}
                className={cn(
                  "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
                  mime === t.key ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                )}
                onClick={() => {
                  setMime(t.key);
                  setPage(1);
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* 批量操作条 */}
          <div className="flex items-center gap-4 border-b pb-2">
            <button
              type="button"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
              onClick={() => {
                const next = !allChecked;
                setSelected(next ? new Set(items.map((i) => i.id)) : new Set());
              }}
            >
              {allChecked ? <Check className="h-4 w-4 text-primary" /> : <span className="h-4 w-4 rounded border" />}
              全选
            </button>
            <button
              type="button"
              className="ml-auto text-sm text-muted-foreground hover:text-primary"
              onClick={() => {
                if (!selected.size) {
                  toast.error("请先勾选文件");
                  return;
                }
                moveMany([...selected]);
              }}
            >
              修改分组
            </button>
            <button
              type="button"
              className="text-sm text-destructive hover:underline"
              onClick={() => {
                if (!selected.size) {
                  toast.error("请先勾选文件");
                  return;
                }
                deleteFiles([...selected]);
              }}
            >
              批量删除
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((m) => (
              <div key={m.id} className="overflow-hidden rounded-lg border bg-card">
                <div className="relative aspect-square bg-muted">
                  <button
                    type="button"
                    className="absolute left-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded border bg-background/80"
                    onClick={() => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(m.id)) next.delete(m.id);
                        else next.add(m.id);
                        return next;
                      });
                    }}
                  >
                    {selected.has(m.id) && <Check className="h-4 w-4 text-primary" />}
                  </button>
                  {m.mime.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/uploads/${m.path}`} alt={m.filename} className="h-full w-full object-cover" loading="lazy" />
                  ) : m.mime.startsWith("video/") ? (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-muted text-muted-foreground">
                      <Video className="h-8 w-8" />
                      <span className="text-xs">视频</span>
                    </div>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-muted">
                      <span className="rounded bg-foreground/10 px-2 py-0.5 font-mono text-xs lowercase text-muted-foreground">
                        {m.mime.split("/")[1]?.toUpperCase() || "FILE"}
                      </span>
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <p className="truncate text-xs font-medium" title={m.filename}>
                    {m.filename}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {fmtSize(m.size)}
                    {m.width && m.height ? ` · ${m.width}×${m.height}` : ""}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <button className="hover:text-primary" onClick={() => renameFile(m)}>
                      改名
                    </button>
                    <button className="hover:text-primary" onClick={() => moveOne(m)}>
                      分组
                    </button>
                    <button className="text-destructive hover:underline" onClick={() => deleteFiles([m.id])}>
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {items.length === 0 && (
            <div className="rounded-lg border border-dashed p-16 text-center text-sm text-muted-foreground">
              当前文件夹暂无文件
            </div>
          )}
        </div>
      </div>

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
