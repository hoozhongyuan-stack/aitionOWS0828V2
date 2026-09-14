/**
 * 关键词解析(V4.7.0)。
 *
 * 后台「SEO 关键词」是一个自由文本输入框(编辑页标注"逗号分隔"),实际录入时中英文逗号、
 * 分号、多余空格都会出现,甚至同一关键词重复。这里统一清洗成可直接渲染的标签数组:
 * - 中英文逗号、中文顿号、分号都当分隔符(录入习惯差异)
 * - 去掉首尾空白与空项,大小写敏感地按原样去重(保留用户键入的写法)
 * - 限制数量(默认 12),防止恶意/误粘贴的超长列表把页面撑爆
 */
const SEPARATORS = /[,，、;；]/;

export const MAX_KEYWORDS = 12;

export function parseKeywords(raw: string | null | undefined, max = MAX_KEYWORDS): string[] {
  if (!raw) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(SEPARATORS)) {
    const k = part.trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
    if (out.length >= max) break;
  }
  return out;
}
