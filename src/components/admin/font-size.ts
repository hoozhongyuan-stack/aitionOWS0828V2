import TextStyle from "@tiptap/extension-text-style";

/**
 * 文字样式扩展(V4.6.2):在 TextStyle 上追加 color / fontSize 两个属性与四个命令。
 *
 * 为什么合成一个扩展:TextStyle 只能注册一次(同名扩展会互相覆盖)——
 * 之前分别注册 TextStyle 与 FontSize 导致属性/命令都未生效(用户验收发现"字号颜色无效")。
 * 档位制:字号下拉固定档位、颜色仅品牌色板;输出 span 内联样式,
 * 渲染端 sanitize 白名单定向放行这两个声明(见 lib/sanitize.ts)。
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    textStyleExt: {
      setColor: (color: string) => ReturnType;
      unsetColor: () => ReturnType;
      setFontSize: (size: number | string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

export const TextStyleExt = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      color: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).style.color || null,
        renderHTML: (attrs: { color?: string | null }) =>
          attrs.color ? { style: `color: ${attrs.color}` } : {},
      },
      fontSize: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).style.fontSize?.replace(/px$/, "") || null,
        renderHTML: (attrs: { fontSize?: string | null }) =>
          attrs.fontSize ? { style: `font-size: ${attrs.fontSize}px` } : {},
      },
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setColor:
        (color: string) =>
        ({ chain }) =>
          chain().setMark("textStyle", { color }).run(),
      unsetColor:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { color: null }).removeEmptyTextStyle().run(),
      setFontSize:
        (size: number | string) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: String(size).replace(/px$/, "") }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

/** 编辑器色板:品牌色 + 常用色;不开放自由取色 */
export const EDITOR_COLORS: { label: string; value: string }[] = [
  { label: "酒红", value: "#8e1c2e" },
  { label: "金", value: "#c6a15b" },
  { label: "墨", value: "#261d18" },
  { label: "白", value: "#ffffff" },
  { label: "灰", value: "#6b7280" },
  { label: "绿", value: "#16a34a" },
  { label: "蓝", value: "#2563eb" },
  { label: "橙", value: "#ea580c" },
];

/** 字号档位 */
export const EDITOR_FONT_SIZES = ["12", "14", "16", "18", "20", "24", "32"] as const;
