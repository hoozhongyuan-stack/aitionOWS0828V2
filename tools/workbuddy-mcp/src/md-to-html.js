/**
 * Markdown → 官网白名单 HTML。
 *
 * 白名单口径与前端 `src/lib/sanitize.ts` **严格一致**——那里是渲染端的最后防线，
 * 提前在这里转换，可避免"推上去才发现标签被剥"的返工。
 *
 * 额外做两件官网要求的事：
 *  1. H1 自动降级为 H2（官网正文白名单不含 h1，文章标题由 title 字段承担）；
 *  2. 检测会被剥离的写法（内联样式、自定义标签、script），供工具回执提醒用户。
 */
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

const SANITIZE_OPTIONS = {
  allowedTags: [
    // 文本块
    "p", "br", "hr", "h2", "h3", "blockquote", "pre", "code",
    // 行内样式
    "strong", "em", "s", "del", "u", "span",
    // 列表 / 媒体 / 链接
    "ul", "ol", "li", "a", "img", "video",
    // 表格（编辑器未启用但保留，防内容意外丢失）
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
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: {
    a: ["http", "https", "mailto"],
    img: ["http", "https"],
    video: ["http", "https"],
  },
  // 内联 style 是 CSS 注入载体；官网视觉由 .rich-content 样式接管
  allowedStyles: {},
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, rel: "noopener noreferrer nofollow" },
    }),
  },
};

/**
 * Markdown → 安全的正文 HTML。
 * @param {string} markdown 正文
 * @returns {string} 白名单过滤后的 HTML
 */
export function markdownToSafeHtml(markdown) {
  if (!markdown || !markdown.trim()) return "";
  let html = marked.parse(markdown, { gfm: true, breaks: false });
  // H1 → H2（含带属性的写法）；官网正文从 H2 起
  html = html.replace(/<h1(\s[^>]*)?>/gi, "<h2$1>").replace(/<\/h1>/gi, "</h2>");
  return sanitizeHtml(html, SANITIZE_OPTIONS).trim();
}

/** 由 Markdown 提取纯文本摘要（未提供 summary 时自动生成） */
export function plainExcerpt(markdown, maxLen = 110) {
  const text = (markdown || "")
    .replace(/```[\s\S]*?```/g, " ") // 代码块
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // 图片
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // 链接保留文字
    .replace(/[#>*`_~|-]+/g, " ") // 标记符号
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1).trimEnd() + "…";
}

/**
 * 检测会被官网剥离或降级的写法，返回提示文案（供工具回执转告用户，非阻断项）。
 * @param {string} markdown 用户原始正文
 * @returns {string[]} 提示列表（空数组 = 无风险）
 */
export function detectRiskySyntax(markdown) {
  const md = markdown || "";
  const notes = [];
  if (/^#\s+\S/m.test(md)) {
    notes.push("正文含一级标题（#），已自动降级为二级标题——官网正文从 H2 起，文章标题请用 title 字段");
  }
  if (/style\s*=/i.test(md) || /<(div|section|iframe|style)\b/i.test(md)) {
    notes.push("正文含内联样式或自定义标签（div/section/iframe/style），官网会剥离样式与未知标签，排版请用 Markdown 语义（标题/列表/粗体/表格/图片）");
  }
  if (/<script\b/i.test(md)) {
    notes.push("⚠️ 正文含 <script>，出于安全已全部剥离");
  }
  if (/<h4|<h5|<h6/i.test(md)) {
    notes.push("正文含 H4–H6 标题，官网白名单只保留 H2/H3（H4+ 会被剥壳保留文字），建议改用 H2/H3 或加粗行");
  }
  return notes;
}
