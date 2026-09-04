import { Node, mergeAttributes } from "@tiptap/core";

/**
 * 视频节点扩展(DEF-012 修复):让 Tiptap schema 认识 <video> 标签。
 * 没有它,insertContent('<video ...>') 会被 schema 静默丢弃——
 * 后台上传视频成功但编辑器无反应(生产 2026-09-04 缺陷)。
 * 属性行白名单:src/controls/preload/poster,样式 max-width 全宽自适应。
 */
export const Video = Node.create({
  name: "video",
  group: "block",
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      controls: { default: "" },
      preload: { default: "metadata" },
      poster: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "video[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "video",
      mergeAttributes(HTMLAttributes, {
        controls: "",
        preload: "metadata",
        style: "max-width:100%",
      }),
    ];
  },
});
