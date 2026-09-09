"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ImagePlus, X } from "lucide-react";
import { MediaPicker } from "@/components/admin/media-picker";

/**
 * 通用图片上传字段(后台):单一入口——点击「上传/更换」直接拉起素材选择器
 * (V4.1.1 统一入口:选择器内含「素材库|本地上传」双 Tab,上传后自动选用)。
 * 用于 LOGO / favicon / 封面图 / 图集等场景。
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
  /** 建议尺寸/格式提示,展示在按钮下方,帮助后台人员上传合适的图片 */
  hint?: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

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
        <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
          {value ? "更换" : "上传"}
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange("")}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        accept={accept}
        onPick={(url) => {
          onChange(url);
          toast.success("已选用");
        }}
      />
    </div>
  );
}
