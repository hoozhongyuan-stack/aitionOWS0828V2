import sanitizeHtml from "sanitize-html";

/**
 * 富文本 HTML 服务端消毒(XSS 防线):
 * Tiptap 富文本(article 正文/协议/投稿)以 dangerouslySetInnerHTML 渲染,
 * 其中用户投稿(source=UGC)是未信任输入——任何能直连接口的客户端都可提交任意 HTML。
 *
 * 白名单与编辑器实际输出的节点一一对应(rich-text-editor.tsx:
 * StarterKit + Image + Link + 受控 <video>),多余标签一律剥除,
 * 因此渲染端复用同一函数即是安全的兜底;写端(UGC 入库)同样调用。
 */

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    // 文本块
    "p", "br", "hr", "h2", "h3", "blockquote", "pre", "code",
    // 行内样式
    "strong", "em", "s", "del", "u", "span",
    // 列表 / 媒体 / 链接
    "ul", "ol", "li", "a", "img", "video",
    // 编辑器未启用但粘贴可能带入,保留以防内容意外丢失
    "table", "thead", "tbody", "tr", "th", "td",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    img: ["src", "alt", "title", "width", "height", "loading"],
    video: ["src", "controls", "preload"],
    th: ["colspan", "rowspan"],
    td: ["colspan", "rowspan"],
    span: [],
  },
  // 显式禁掉 javascript:/vbscript: 等危险协议;相对路径(/uploads/...)天然放行
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { a: ["http", "https", "mailto"], img: ["http", "https"], video: ["http", "https"] },
  // 内联 style 是 CSS 注入载体(定位覆盖钓鱼等);视觉尺寸已由 .rich-content 样式接管,统一剥离
  allowedStyles: {},
  transformTags: {
    // 外链加 rel 兜底(target=_blank 打开者上下文安全)
    a: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, rel: "noopener noreferrer nofollow" },
    }),
  },
};

/** 按 Tiptap 输出白名单消毒富文本 HTML;非法标签剥壳留文、事件属性全删 */
export function sanitizeRichHtml(html: string): string {
  return sanitizeHtml(html ?? "", OPTIONS);
}
