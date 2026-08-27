import { prisma } from "@/lib/db";
import { routing } from "@/i18n/routing";

/**
 * 多语言服务:语言启用管理 + 界面文案 DB 覆盖。
 * 缓存策略与 Setting 一致:进程内缓存 + 写入时失效。
 */

export interface LocaleRow {
  code: string;
  name: string;
  isDefault: boolean;
  enabled: boolean;
  sort: number;
}

type Caches = {
  locales?: LocaleRow[];
  messages: Map<string, Record<string, unknown>>; // locale -> 合并后的 DB 覆盖(嵌套结构)
};
const g = globalThis as unknown as { __aitionI18nCache?: Caches };
const cache: Caches = (g.__aitionI18nCache ??= { messages: new Map() });

/** 全部语言(按 sort) */
export async function getLocales(): Promise<LocaleRow[]> {
  if (cache.locales) return cache.locales;
  const rows = await prisma.locale.findMany({ orderBy: { sort: "asc" } });
  cache.locales = rows;
  return rows;
}

/** 前台启用的语言 */
export async function getEnabledLocales(): Promise<LocaleRow[]> {
  return (await getLocales()).filter((l) => l.enabled);
}

/** 运行时默认语言(后台可改;兜底编译期默认) */
export async function getDefaultLocale(): Promise<string> {
  const rows = await getLocales();
  return rows.find((l) => l.isDefault && l.enabled)?.code ?? routing.defaultLocale;
}

/** 保存语言配置(整表覆盖式更新;保证有且仅有一个默认语言) */
export async function saveLocales(rows: LocaleRow[]): Promise<void> {
  // 至少启用一个语言;默认语言必须启用
  const enabled = rows.filter((r) => r.enabled);
  if (enabled.length === 0) throw new Error("至少需要启用一种语言");
  if (!rows.some((r) => r.isDefault && r.enabled)) {
    rows = rows.map((r, i) => ({ ...r, isDefault: r.enabled && i === rows.findIndex((x) => x.enabled) }));
  }
  let defaultSeen = false;
  for (const r of rows) {
    const isDefault = r.isDefault && r.enabled && !defaultSeen;
    if (isDefault) defaultSeen = true;
    await prisma.locale.upsert({
      where: { code: r.code },
      update: { name: r.name, isDefault, enabled: r.enabled, sort: r.sort },
      create: { code: r.code, name: r.name, isDefault, enabled: r.enabled, sort: r.sort },
    });
  }
  invalidateI18nCache();
}

/**
 * 读取某语言的界面文案 DB 覆盖(嵌套对象,可直接 deep-merge 到 messages 文件)。
 * key 支持点路径(如 "hero.title")自动展开为嵌套。
 */
export async function getUiOverrides(locale: string): Promise<Record<string, unknown>> {
  const hit = cache.messages.get(locale);
  if (hit) return hit;
  const rows = await prisma.uiTranslation.findMany({ where: { locale } });
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    const path = [row.namespace, ...row.key.split(".")];
    let node: Record<string, unknown> = result;
    for (let i = 0; i < path.length - 1; i++) {
      const seg = path[i];
      if (typeof node[seg] !== "object" || node[seg] === null) node[seg] = {};
      node = node[seg] as Record<string, unknown>;
    }
    node[path[path.length - 1]] = row.value;
  }
  cache.messages.set(locale, result);
  return result;
}

/** 列出某语言全部覆盖行(后台编辑用) */
export async function listUiTranslations(locale: string) {
  return prisma.uiTranslation.findMany({ where: { locale }, orderBy: [{ namespace: "asc" }, { key: "asc" }] });
}

/** 批量保存覆盖行 */
export async function saveUiTranslations(rows: { locale: string; namespace: string; key: string; value: string }[]) {
  for (const r of rows) {
    await prisma.uiTranslation.upsert({
      where: { locale_namespace_key: { locale: r.locale, namespace: r.namespace, key: r.key } },
      update: { value: r.value },
      create: r,
    });
  }
  invalidateI18nCache();
}

/** 删除一条覆盖(恢复文件默认文案) */
export async function deleteUiTranslation(id: number) {
  await prisma.uiTranslation.delete({ where: { id } });
  invalidateI18nCache();
}

/** 失效多语言缓存 */
export function invalidateI18nCache(): void {
  cache.locales = undefined;
  cache.messages.clear();
}

/** 深合并(DB 覆盖优先) */
export function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(override)) {
    if (v && typeof v === "object" && !Array.isArray(v) && typeof out[k] === "object" && out[k] !== null) {
      out[k] = deepMerge(out[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}
