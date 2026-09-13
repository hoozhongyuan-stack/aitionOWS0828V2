/**
 * 后台展示名统一取值(V4.6.4):默认语言优先,缺失回退任意语言,再回退给定兜底串。
 *
 * 背景:后台多处直接用 `translations[0]?.name` —— 依赖翻译数组顺序(Prisma 未指定
 * orderBy,顺序无保证),英文排在前的数据会显示英文(用户验收发现"栏目显示英文")。
 * 展示口径统一走本模块,勿再直取数组首项。
 */

export const ADMIN_DEFAULT_LOCALE = "zh-CN";

/** 栏目名 / 任意含 name 的翻译行 */
export function adminName(
  translations: { locale?: string; name?: string | null }[] | undefined | null,
  fallback = "-"
): string {
  if (!translations?.length) return fallback;
  return (
    translations.find((t) => t.locale === ADMIN_DEFAULT_LOCALE)?.name ||
    translations[0]?.name ||
    fallback
  );
}

/** 内容标题 / 任意含 title 的翻译行 */
export function adminTitle(
  translations: { locale?: string; title?: string | null }[] | undefined | null,
  fallback = "-"
): string {
  if (!translations?.length) return fallback;
  return (
    translations.find((t) => t.locale === ADMIN_DEFAULT_LOCALE)?.title ||
    translations[0]?.title ||
    fallback
  );
}

/** 内容摘要 */
export function adminSummary(
  translations: { locale?: string; summary?: string | null }[] | undefined | null,
  fallback = ""
): string {
  if (!translations?.length) return fallback;
  return (
    translations.find((t) => t.locale === ADMIN_DEFAULT_LOCALE)?.summary ||
    translations[0]?.summary ||
    fallback
  );
}

/** 内容正文 */
export function adminBody(
  translations: { locale?: string; body?: string | null }[] | undefined | null,
  fallback = ""
): string {
  if (!translations?.length) return fallback;
  return (
    translations.find((t) => t.locale === ADMIN_DEFAULT_LOCALE)?.body ||
    translations[0]?.body ||
    fallback
  );
}
