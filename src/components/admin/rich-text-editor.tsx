"use client";

import { useEffect, useState } from "react";
import { promptDialog } from "@/components/admin/dialogs";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TextStyleExt, EDITOR_COLORS, EDITOR_FONT_SIZES } from "@/components/admin/font-size";
import Link from "@tiptap/extension-link";
import { MediaPicker } from "@/components/admin/media-picker";
import {
  Bold,
  Italic,
  Strikethrough,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Minus,
  Link as LinkIcon,
  Unlink,
  ImagePlus,
  Video,
  Undo2,
  Redo2,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tiptap 富文本编辑器(需求 4.4):
 * 图文混排 / 视频 / 链接 / 列表 / 引用等可视化编辑,输出干净语义化 HTML(SEO 友好)。
 * 图片经后台上传接口存本地 uploads/;视频以受控 <video> 标签插入。
 */

function ToolbarButton({
  onClick,
  active,
  title,
  children,
  disabled,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40",
        active && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
      )}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = 280,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  /** 自定义上传通道(默认走后台管理员上传;前台投稿传入用户上传) */
  uploader?: (file: File) => Promise<{ url: string }>;
}) {
  const [pickerMode, setPickerMode] = useState<null | "image" | "video">(null); // 素材库选择(V4.2)

  const editor = useEditor({
    immediatelyRender: false, // SSR 环境必需
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Image.configure({ HTMLAttributes: { loading: "lazy" } }),
      TextStyleExt,
      Link.configure({ openOnClick: false, autolink: true }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class: "prose-editor focus:outline-none",
        style: `min-height:${minHeight}px`,
      },
    },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : editor.getHTML()),
  });

  // 素材库选中插入(V4.2)
  function insertFromPicker(url: string) {
    if (!editor) return;
    if (pickerMode === "image") {
      editor.chain().focus().setImage({ src: url, alt: "" }).run();
    } else {
      editor.chain().focus().insertContent(`<video src="${url}" controls preload="metadata" style="max-width:100%"></video><p></p>`).run();
    }
  }

  // 外部 value 变化(如切换语言 tab)时同步编辑器内容
  useEffect(() => {
    if (editor && value !== editor.getHTML() && !(editor.isEmpty && !value)) {
      editor.commands.setContent(value || "", false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) return <div className="rounded-md border p-4 text-sm text-muted-foreground">编辑器加载中…</div>;



  async function setLink() {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = await promptDialog({ title: "链接地址(留空移除链接)", defaultValue: prev ?? "https://" });
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  return (
    <div className="rounded-md border">
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 p-1">
        <ToolbarButton title="加粗" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="斜体" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="删除线"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-border" />
        <ToolbarButton
          title="二级标题"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="三级标题"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-border" />
        <ToolbarButton
          title="无序列表"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="有序列表"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="引用"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="分割线" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <Minus className="h-4 w-4" />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-border" />
        {/* 字号 / 文字颜色(V4.6.2):档位与品牌色板,选中文字后应用 */}
        <select
          className="h-8 rounded border bg-background px-1 text-xs"
          value={(editor.getAttributes("textStyle").fontSize as string) ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) editor.chain().focus().unsetFontSize().run();
            else editor.chain().focus().setFontSize(v).run();
          }}
          aria-label="字号"
          title="字号"
        >
          <option value="">字号</option>
          {EDITOR_FONT_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}px
            </option>
          ))}
        </select>
        <select
          className="h-8 rounded border bg-background px-1 text-xs"
          value={(editor.getAttributes("textStyle").color as string) ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) editor.chain().focus().unsetColor().run();
            else editor.chain().focus().setColor(v).run();
          }}
          aria-label="文字颜色"
          title="文字颜色"
        >
          <option value="">颜色</option>
          {EDITOR_COLORS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <span className="mx-1 h-5 w-px bg-border" />
        <ToolbarButton title="插入/编辑链接" active={editor.isActive("link")} onClick={setLink}>
          <LinkIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="移除链接" disabled={!editor.isActive("link")} onClick={() => editor.chain().focus().unsetLink().run()}>
          <Unlink className="h-4 w-4" />
        </ToolbarButton>
        {/* V4.1.1 统一入口:按钮直接拉起素材选择器(素材库|本地上传 双 Tab) */}
        <ToolbarButton title="插入图片" onClick={() => setPickerMode("image")}>
          <ImagePlus className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="插入视频" onClick={() => setPickerMode("video")}>
          <Video className="h-4 w-4" />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-border" />
        <ToolbarButton title="撤销" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="重做" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 className="h-4 w-4" />
        </ToolbarButton>
      </div>
      <div className="px-3 py-2">
        {placeholder && editor.isEmpty && (
          <div className="pointer-events-none absolute text-sm text-muted-foreground">{placeholder}</div>
        )}
        <EditorContent editor={editor} />
      </div>
      <MediaPicker
        open={pickerMode !== null}
        onOpenChange={(v) => !v && setPickerMode(null)}
        accept={pickerMode === "video" ? "video/mp4" : "image/*"}
        onPick={insertFromPicker}
      />
    </div>
  );
}
