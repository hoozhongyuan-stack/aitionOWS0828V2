"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiGet, apiPost } from "@/components/admin/api-client";
import { cn } from "@/lib/utils";
import { FolderPlus, Search, Upload } from "lucide-react";

/**
 * 素材选择器(V4.2):弹窗内选择已上传素材(按文件夹)或直接上传到当前文件夹;
 * 选中回调 onPick(url)。供 UploadField/富文本图片/视频等入口共用。
 */
interface FolderNode {
  id: number;
  name: string;
  parentId: number | null;
  children: { id: number; name: string }[];
}
interface AssetRow {
  id: number;
  path: string;
  filename: string;
  mime: string;
}

export function MediaPicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 选中素材回调(返回 /uploads/... URL) */
  onPick: (url: string) => void;
}) {
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [current, setCurrent] = useState<string>(""); // ""=未分类;数字串=文件夹 id
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [uploading, setUploading] = useState(false);
  const pageSize = 24;

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams({ picker: "1", page: String(page), pageSize: String(pageSize) });
      q.set("folderId", current === "" ? "unassigned" : current);
      if (keyword.trim()) q.set("keyword", keyword.trim());
      const d = await apiGet<{ folders: FolderNode[]; items: AssetRow[]; total: number }>(
        `/api/admin/media?${q}`
      );
      setFolders(d.folders);
      setAssets(d.items);
      setTotal(d.total);
    } catch {
      toast.error("素材加载失败");
    }
  }, [current, page, keyword]);
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  async function upload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      if (current !== "") form.set("folderId", current);
      const r = await fetch("/api/admin/upload", { method: "POST", body: form });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.message || "上传失败");
      toast.success("上传成功");
      setPage(1);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
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

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>素材库</DialogTitle>
          <DialogDescription>选择已有素材,或上传新文件到当前文件夹</DialogDescription>
        </DialogHeader>
        <div className="flex gap-4">
          {/* 文件夹树 */}
          <div className="w-44 shrink-0 space-y-1">
            <button
              className={cn(
                "block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent",
                current === "" && "bg-accent font-medium"
              )}
              onClick={() => {
                setCurrent("");
                setPage(1);
              }}
            >
              未分类
            </button>
            {folders.map((f) => (
              <div key={f.id}>
                <button
                  className={cn(
                    "block w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-accent",
                    current === String(f.id) && "bg-accent font-medium"
                  )}
                  onClick={() => {
                    setCurrent(String(f.id));
                    setPage(1);
                  }}
                >
                  {f.name}
                </button>
                {f.children.map((c) => (
                  <button
                    key={c.id}
                    className={cn(
                      "block w-full truncate rounded px-2 py-1.5 pl-6 text-left text-sm text-muted-foreground hover:bg-accent",
                      current === String(c.id) && "bg-accent font-medium text-foreground"
                    )}
                    onClick={() => {
                      setCurrent(String(c.id));
                      setPage(1);
                    }}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            ))}
            <Button
              size="sm"
              variant="ghost"
              className="w-full justify-start text-xs"
              onClick={async () => {
                const name = window.prompt("新建文件夹名称(当前为一级;在二级文件夹内则为其次级)");
                if (!name?.trim()) return;
                const parentId = current === "" || current === "unassigned" ? null : Number(current);
                await folderAction(
                  { action: "createFolder", name: name.trim(), parentId: parentId && !Number.isNaN(parentId) ? parentId : null },
                  "文件夹已创建"
                );
              }}
            >
              <FolderPlus className="mr-1 h-3.5 w-3.5" />
              新建文件夹
            </Button>
            {current !== "" && (
              <div className="space-y-1 pt-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full justify-start text-xs"
                  onClick={async () => {
                    const name = window.prompt("重命名文件夹");
                    if (!name?.trim()) return;
                    await folderAction({ action: "renameFolder", id: Number(current), name: name.trim() }, "已重命名");
                  }}
                >
                  重命名当前文件夹
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full justify-start text-xs text-destructive"
                  onClick={async () => {
                    if (!window.confirm("删除空文件夹?")) return;
                    await folderAction({ action: "deleteFolder", id: Number(current) }, "已删除");
                    setCurrent("");
                  }}
                >
                  删除当前文件夹(需为空)
                </Button>
              </div>
            )}
          </div>

          {/* 素材网格 */}
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="搜索文件名…"
                  value={keyword}
                  onChange={(e) => {
                    setKeyword(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <label className="shrink-0">
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) upload(f);
                  }}
                />
                <Button size="sm" variant="outline" disabled={uploading} onClick={(e) => (e.currentTarget.previousElementSibling as HTMLInputElement)?.click()} asChild={false}>
                  <Upload className="mr-1 h-3.5 w-3.5" />
                  {uploading ? "上传中…" : "上传到此文件夹"}
                </Button>
              </label>
            </div>
            <div className="grid max-h-80 grid-cols-4 gap-2 overflow-y-auto">
              {assets.map((a) => (
                <button
                  key={a.id}
                  className="group relative aspect-square overflow-hidden rounded border hover:ring-2 hover:ring-primary"
                  title={a.filename}
                  onClick={() => {
                    onPick(`/uploads/${a.path}`);
                    onOpenChange(false);
                  }}
                >
                  {a.mime.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/uploads/${a.path}`} alt={a.filename} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-muted text-xs">
                      <span className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono">VIDEO</span>
                      <span className="line-clamp-2 px-1 text-muted-foreground">{a.filename}</span>
                    </div>
                  )}
                </button>
              ))}
              {assets.length === 0 && (
                <div className="col-span-4 py-10 text-center text-sm text-muted-foreground">当前文件夹暂无素材</div>
              )}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  上一页
                </Button>
                <span>
                  {page} / {totalPages}
                </span>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  下一页
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
