import TextStyle from "@tiptap/extension-text-style";

/**
 * 字号扩展(V4.6.2):基于 TextStyle 追加 fontSize 属性。
 * 档位制(工具栏下拉),输出 font-size 内联样式;渲染端消毒白名单定向放行该属性。
 */
export const FontSize = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (el) => el.style.fontSize?.replace(/px$/, "") ?? null,
        renderHTML: (attrs) =>
          attrs.fontSize ? { style: `font-size: ${attrs.fontSize}px` } : {},
      },
    };
  },
});

/** 编辑器色板(V4.6.2):品牌色+常用色;不开放自由取色 */
export const EDITOR_COLORS = [
  { label: "默认", value: "" },
  { label: "酒红", value: "#8e1c2e" },
  { label: "金", value: "#c6a15b" },
  { label: "墨", value: "#261d18" },
  { label: "白", value: "#ffffff" },
  { label: "灰", value: "#6b7280" },
  { label: "绿", value: "#16a34a" },
  { label: "蓝", value: "#2563eb" },
  { label: "橙", value: "#ea580c" },
] as const;

export const EDITOR_FONT_SIZES = ["12", "14", "16", "18", "20", "24", "32"] as const;
