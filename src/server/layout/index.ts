import { prisma } from "@/lib/db";
import { listPublishedByCategory } from "@/server/content";

/**
 * V3.2 前台布局预设(方案 A · 轻量):
 * 首页/栏目页的布局模板与区块显隐,存 Setting(group="layout"),
 * 未知/缺省回退默认(=现状布局,存量站点升级零变化)。
 * 校验在 settings API 边界(zod),本模块做类型化读取与合并。
 */

export type HomePreset = "grid" | "hero-list" | "split";
export type CategoryPreset = "list" | "magazine";
/** 首页楼层样式(V3.3 D):grid3 三列卡片 / list 紧凑列表 / feature 首条大图特写+其余双列 */
export type FloorStyle = "grid3" | "list" | "feature";

export interface HomeLayoutConfig {
  preset: HomePreset;
  sections: { banners: boolean; latest: boolean };
}
export interface CategoryLayoutConfig {
  preset: CategoryPreset;
  sections: { header: boolean };
}
/** 首页楼层(V3.3 D):每层绑定一个栏目,取该栏目最新 limit 条;title 缺省取栏目名 */
export interface HomeFloor {
  categoryId: number;
  style: FloorStyle;
  limit: number;
  title?: string;
}

const HOME_DEFAULT: HomeLayoutConfig = { preset: "grid", sections: { banners: true, latest: true } };
const CATEGORY_DEFAULT: CategoryLayoutConfig = { preset: "list", sections: { header: true } };

const HOME_PRESETS = new Set(["grid", "hero-list", "split"]);
const CATEGORY_PRESETS = new Set(["list", "magazine"]);
const FLOOR_STYLES = new Set<string>(["grid3", "list", "feature"]);
export const FLOOR_MAX = 8;
export const FLOOR_LIMIT_DEFAULT = 6;
const FLOOR_LIMIT_MAX = 12;

async function readGroup(key: string): Promise<Record<string, unknown>> {
  const row = await prisma.setting.findUnique({ where: { group_key: { group: "layout", key } } });
  if (!row?.value) return {};
  try {
    const parsed = JSON.parse(row.value);
    return typeof parsed === "object" && parsed ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function getHomeLayout(): Promise<HomeLayoutConfig> {
  const raw = await readGroup("home");
  const preset = HOME_PRESETS.has(String(raw.preset)) ? (raw.preset as HomePreset) : HOME_DEFAULT.preset;
  const sections = {
    banners: raw.banners !== false,
    latest: raw.latest !== false,
  };
  return { preset, sections };
}

export async function getCategoryLayout(): Promise<CategoryLayoutConfig> {
  const raw = await readGroup("category");
  const preset = CATEGORY_PRESETS.has(String(raw.preset)) ? (raw.preset as CategoryPreset) : CATEGORY_DEFAULT.preset;
  const sections = { header: raw.header !== false };
  return { preset, sections };
}

/**
 * 首页楼层配置(V3.3 D):Setting(group=layout, key="floors")。
 * 后台保存走通用 settings API(floors 键直接落 JSON 数组),读取兼容裸数组与
 * {floors:[...]} 包装两种形状;逐条容错校验(非法条目跳过,不整组丢弃);
 * 隐藏条目(visible=false)不返回;引用已删除栏目的楼层在渲染侧按空结果自然跳过。
 */
export async function getHomeFloors(): Promise<HomeFloor[]> {
  const raw = await readGroup("floors");
  const arr = Array.isArray(raw.floors) ? raw.floors : Array.isArray(raw) ? raw : [];
  const out: HomeFloor[] = [];
  for (const f of arr) {
    if (!f || typeof f !== "object") continue;
    const o = f as Record<string, unknown>;
    if (o.visible === false) continue;
    const categoryId = Number(o.categoryId);
    if (!Number.isInteger(categoryId) || categoryId <= 0) continue;
    const style = FLOOR_STYLES.has(String(o.style)) ? (String(o.style) as FloorStyle) : "grid3";
    const limitRaw = Number(o.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw >= 1 ? Math.min(Math.floor(limitRaw), FLOOR_LIMIT_MAX) : FLOOR_LIMIT_DEFAULT;
    const title = typeof o.title === "string" && o.title.trim() ? o.title.trim().slice(0, 60) : undefined;
    out.push({ categoryId, style, limit, title });
    if (out.length >= FLOOR_MAX) break;
  }
  return out;
}

/** 首页楼层渲染数据:配置 + 栏目(slug/名称/moduleType) + 该栏目最新内容(shapeCard 同构) */
export interface HomeFloorSection {
  floor: HomeFloor;
  slug: string;
  name: string;
  moduleType: "product" | undefined;
  items: NonNullable<Awaited<ReturnType<typeof listPublishedByCategory>>>["items"];
}

/**
 * 组装首页楼层渲染数据(首页 page 的唯一数据入口,页面层不查库):
 * 各楼层并行取栏目与最新内容;已删/不可见栏目或无内容的楼层返回时自然剔除。
 */
export async function getHomeFloorSections(locale: string): Promise<HomeFloorSection[]> {
  const cfgs = await getHomeFloors();
  const sections = await Promise.all(
    cfgs.map(async (floor): Promise<HomeFloorSection | null> => {
      const cat = await prisma.category.findUnique({
        where: { id: floor.categoryId },
        include: { translations: true },
      });
      if (!cat || !cat.visible) return null;
      const data = await listPublishedByCategory(cat.slug, locale, 1, floor.limit);
      if (!data || data.items.length === 0) return null;
      return {
        floor,
        slug: cat.slug,
        name:
          cat.translations.find((tr) => tr.locale === locale)?.name ??
          cat.translations[0]?.name ??
          cat.slug,
        moduleType: cat.moduleType === "product" ? "product" : undefined,
        items: data.items,
      };
    })
  );
  return sections.filter((x): x is HomeFloorSection => x !== null);
}

/** 保存布局配置(后台);非法值回退默认,保证落库数据始终合法 */
export async function saveHomeLayout(input: { preset?: string; sections?: Record<string, boolean> }) {
  const preset = HOME_PRESETS.has(String(input.preset)) ? String(input.preset) : HOME_DEFAULT.preset;
  const sections = { banners: input.sections?.banners !== false, latest: input.sections?.latest !== false };
  await prisma.setting.upsert({
    where: { group_key: { group: "layout", key: "home" } },
    update: { value: JSON.stringify({ preset, sections }) },
    create: { group: "layout", key: "home", value: JSON.stringify({ preset, sections }) },
  });
}

export async function saveCategoryLayout(input: { preset?: string; sections?: Record<string, boolean> }) {
  const preset = CATEGORY_PRESETS.has(String(input.preset)) ? String(input.preset) : CATEGORY_DEFAULT.preset;
  const sections = { header: input.sections?.header !== false };
  await prisma.setting.upsert({
    where: { group_key: { group: "layout", key: "category" } },
    update: { value: JSON.stringify({ preset, sections }) },
    create: { group: "layout", key: "category", value: JSON.stringify({ preset, sections }) },
  });
}
