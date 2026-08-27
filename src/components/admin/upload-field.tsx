"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiUpload } from "@/components/admin/api-client";
import { ImagePlus, X } from "lucide-react";

/**
 * 通用图片上传字段(后台):选择文件 → 本地存储 → 回填 URL。
 * 用于 LOGO / favicon / 封面图等场景。
 */
export function UploadField({
  value,
  onChange,
  label,
  accept = "image/*",
  hint,
}: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  accept?: string;
  /** 建议尺寸/格式提示,展示在上传按钮下方,帮助后台人员上传合适的图片 */
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const r = await apiUpload(file, label);
      onChange(r.url);
      toast.success("上传成功");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt={label || "已上传图片"} className="h-12 w-12 rounded border object-contain" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded border text-muted-foreground">
            <ImagePlus className="h-5 w-5" />
          </div>
        )}
        <input ref={inputRef} type="file" accept={accept} onChange={pick} className="hidden" />
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? "上传中…" : value ? "更换" : "上传"}
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange("")}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
