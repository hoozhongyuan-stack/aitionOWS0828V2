import { prisma } from "@/lib/db";

/**
 * V3.2 前台布局预设(方案 A · 轻量):
 * 首页/栏目页的布局模板与区块显隐,存 Setting(group="layout"),
 * 未知/缺省回退默认(=现状布局,存量站点升级零变化)。
 * 校验在 settings API 边界(zod),本模块做类型化读取与合并。
 */

export type HomePreset = "grid" | "hero-list" | "split";
export type CategoryPreset = "list" | "magazine";

export interface HomeLayoutConfig {
  preset: HomePreset;
  sections: { banners: boolean; latest: boolean };
}
export interface CategoryLayoutConfig {
  preset: CategoryPreset;
  sections: { header: boolean };
}

const HOME_DEFAULT: HomeLayoutConfig = { preset: "grid", sections: { banners: true, latest: true } };
const CATEGORY_DEFAULT: CategoryLayoutConfig = { preset: "list", sections: { header: true } };

const HOME_PRESETS = new Set(["grid", "hero-list", "split"]);
const CATEGORY_PRESETS = new Set(["list", "magazine"]);

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
