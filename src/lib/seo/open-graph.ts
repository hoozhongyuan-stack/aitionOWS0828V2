import type { Metadata } from "next";
import { getBrandConfig } from "@/lib/config";

/**
 * 分享 OG(V3.1 REQ-003/004):统一构造 Next Metadata openGraph 对象。
 *
 * 图片兜底链(NFR-002):imagePath(相对 → 按 NEXT_PUBLIC_SITE_URL 绝对化)
 * → 品牌 LOGO 绝对 URL → 均为空时省略 og:image(images=undefined)。
 * metadataBase 由根布局兜底,这里仍显式绝对化,保证不输出相对路径。
 */

/** 站点基础 URL(与 alternates / seo 服务同口径) */
export function siteBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

/** 相对路径 → 绝对 URL;已是绝对 URL(http/https 等)原样保留 */
function toAbsoluteUrl(path: string): string {
  try {
    return new URL(path, siteBaseUrl()).toString();
  } catch {
    // 环境变量配置了非法 URL 时不放大故障:保留原值(下游按字符串输出)
    return path;
  }
}

/**
 * SeoMeta 页面 title → openGraph 用字符串:
 * 字符串原样;{ absolute } 取 absolute;其余(null/undefined)用 fallback(站点名)。
 * 与根布局 title 模板解耦:og 标签的模板叠加由 Next metadata 渲染器处理。
 */
export function resolveMetadataTitle(
  title: Metadata["title"],
  fallback: string
): string {
  if (typeof title === "string" && title) return title;
  if (title && typeof title === "object" && "absolute" in title && title.absolute) {
    return title.absolute;
  }
  return fallback;
}

/** 构造 openGraph 元数据(description/imagePath 允许空,空图按兜底链处理) */
export async function buildOpenGraph(input: {
  title: string;
  description?: string | null;
  imagePath?: string | null;
  locale: string;
}): Promise<NonNullable<Metadata["openGraph"]>> {
  const brand = await getBrandConfig();
  const image = input.imagePath
    ? toAbsoluteUrl(input.imagePath)
    : brand.logoUrl
      ? toAbsoluteUrl(brand.logoUrl)
      : undefined;
  return {
    title: input.title,
    description: input.description ?? undefined,
    locale: input.locale,
    images: image ? [image] : undefined,
  };
}
