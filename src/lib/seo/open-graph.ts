import type { Metadata } from "next";
import { getBrandConfig } from "@/lib/config";
import { getMediaDimensions } from "@/server/media";

/**
 * 分享 OG(V3.1 REQ-003/004):统一构造 Next Metadata openGraph 对象。
 *
 * 图片兜底链(V4.7.1 起带尺寸校验):
 *   imagePath(内容封面/首页轮播图) → 默认分享图(brand.shareImageUrl) → 品牌 LOGO
 * 逐候选检查,**不满足微信分享卡片要求就跳过换下一个**,最后都没有才省略 og:image。
 * 背景:2026-09-14 实测「朋友圈无缩略图」——首页 og:image 兜底到 LOGO(600×180),
 * 高度不足微信要求的 300,于是朋友圈退化成默认链接图标。
 *
 * 跳过规则:
 *   - 空值
 *   - 非 http(s) 协议(data:/blob: 微信抓不到)
 *   - 素材库登记了宽高、且任一边 < MIN_SHARE_IMAGE_SIDE
 * 放行规则(宁可给图也不要没图):素材库未登记该路径(外链/历史数据)、或宽高未知。
 * 同时输出 og:image:width/height,让社交爬虫直接知道尺寸、不必下载后判断。
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

/** 分享图最小边长:微信分享卡片要求缩略图 ≥300×300(朋友圈大图推荐 1200×630) */
export const MIN_SHARE_IMAGE_SIDE = 300;

/** 本站 /uploads/<相对路径> → 素材库的相对路径;外链或非 uploads 路径返回 null */
function toMediaPath(url: string): string | null {
  try {
    const base = new URL(siteBaseUrl());
    const abs = new URL(url, base);
    if (abs.origin !== base.origin) return null; // 外链不查库,直接放行
    const m = abs.pathname.match(/^\/uploads\/(.+)$/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

export interface ShareImage {
  url: string;
  width?: number;
  height?: number;
}

/**
 * 按优先级挑选可用的分享图(导出以便单测)。
 * 命中第一个"尺寸合格或尺寸未知"的候选即返回;全不合格返回 null(调用方省略 og:image)。
 */
export async function pickShareImage(
  candidates: (string | null | undefined)[]
): Promise<ShareImage | null> {
  // 逐候选整理出可用 URL 与待查路径
  const usable: { url: string; mediaPath: string | null }[] = [];
  for (const raw of candidates) {
    if (!raw || raw.trim() === "") continue;
    if (/^(data|blob):/i.test(raw.trim())) continue; // 微信抓不到,直接跳过
    const url = toAbsoluteUrl(raw.trim());
    if (!/^https?:/i.test(url)) continue;
    usable.push({ url, mediaPath: toMediaPath(url) });
  }
  if (usable.length === 0) return null;

  // V4.7.4:webp 显示版优先取其 .jpg 分享伴生(微信分享卡不吃 WebP)。
  // 伴生命名两种约定都识别:同名 .jpg(上传链路)与 -share.jpg(存量回填脚本,
  // 同名会与原 .jpg 资产撞路径 —— 首跑实测教训)。
  const expanded = usable.map((c) => {
    if (c.mediaPath && c.mediaPath.toLowerCase().endsWith(".webp")) {
      const stem = c.mediaPath.replace(/\.webp$/i, "");
      const stemUrl = c.url.replace(/\.webp$/i, "");
      return {
        ...c,
        // -share.jpg(回填,≤1200 宽)优先于同名 .jpg(原图,可能更大)
        sharePaths: [`${stem}-share.jpg`, `${stem}.jpg`],
        shareUrls: [`${stemUrl}-share.jpg`, `${stemUrl}.jpg`],
      };
    }
    return { ...c, sharePaths: [] as string[], shareUrls: [] as string[] };
  });

  const dims = await getMediaDimensions(
    expanded.flatMap((u) => [u.mediaPath, ...u.sharePaths]).filter((x): x is string => !!x)
  );
  let lastResort: ShareImage | null = null;
  for (const c of expanded) {
    // 伴生存在 → 直接用它(它专为分享而生,尺寸与主图一致)
    for (let i = 0; i < c.sharePaths.length; i++) {
      const sd = dims.get(c.sharePaths[i]);
      if (sd?.width && sd.height && sd.width >= MIN_SHARE_IMAGE_SIDE && sd.height >= MIN_SHARE_IMAGE_SIDE) {
        return { url: c.shareUrls[i], width: sd.width, height: sd.height };
      }
    }
    const d = c.mediaPath ? dims.get(c.mediaPath) : undefined;
    const w = d?.width ?? null;
    const h = d?.height ?? null;
    if (w != null && h != null) {
      if (w < MIN_SHARE_IMAGE_SIDE || h < MIN_SHARE_IMAGE_SIDE) continue; // 尺寸不足,换下一个候选
      return { url: c.url, width: w, height: h };
    }
    // 尺寸未知(未登记素材 / 外链 / 历史数据):放行,但记下来作为最后兜底
    if (!lastResort) lastResort = { url: c.url };
  }
  return lastResort;
}

/** 构造 openGraph 元数据(description/imagePath 允许空,空图按兜底链处理) */
export async function buildOpenGraph(input: {
  title: string;
  description?: string | null;
  imagePath?: string | null;
  locale: string;
}): Promise<NonNullable<Metadata["openGraph"]>> {
  const brand = await getBrandConfig();
  const image = await pickShareImage([input.imagePath, brand.shareImageUrl, brand.logoUrl]);
  return {
    title: input.title,
    description: input.description ?? undefined,
    locale: input.locale,
    images: image
      ? [{ url: image.url, ...(image.width && image.height ? { width: image.width, height: image.height } : {}) }]
      : undefined,
  };
}
