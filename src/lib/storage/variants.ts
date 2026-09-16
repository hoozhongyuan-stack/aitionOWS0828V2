import sharp from "sharp";

/**
 * 图片变体生成(V4.7.4):显示版 WebP + 分享伴生 JPG。
 *
 * 背景:此前 PNG 走原格式无损重编码,AI 海报类图片单张 1.3~2.9MB(3M 带宽下 5~8 秒/张)。
 * 现统一为:显示版 WebP q82(宽≤1600)专供页面,分享伴生 JPG q85(宽≤1200)专供 og:image
 * —— 微信分享卡不吃 WebP。
 * 兜底:显示版压完不比原图小 → 视为无收益,返回 null(调用方保留原图)。
 * gif/svg/ico 不处理(svg 是矢量文本、ico 是多尺寸容器、gif 可能是动图)。
 */

export const DISPLAY_MAX_WIDTH = 1600;
export const SHARE_MAX_WIDTH = 1200;
const HANDLED = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface ImageVariants {
  display: { buffer: Buffer; mime: "image/webp" };
  share: { buffer: Buffer; mime: "image/jpeg" } | null;
  /** 显示版实际尺寸(等比后) */
  width: number;
  height: number;
}

export async function buildImageVariants(input: {
  buffer: Buffer;
  mime: string;
}): Promise<ImageVariants | null> {
  if (!HANDLED.has(input.mime)) return null;
  try {
    const meta = await sharp(input.buffer, { failOn: "none" }).metadata();
    if (!meta.format) return null; // 声明为图片但无法解码
  } catch {
    return null;
  }

  const display = await sharp(input.buffer, { failOn: "none" })
    .rotate()
    .resize({ width: DISPLAY_MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  // 无收益(原图已足够小/高效)→ 不替换
  if (display.length >= input.buffer.length) return null;
  const outMeta = await sharp(display).metadata();

  // 分享伴生:**无条件生成**(不与 WebP 比大小)—— 它的意义是让 og:image 永远是 JPG
  // (微信分享卡对 WebP 支持不稳定,V4.7.1 教训);简单图形的 WebP 虽小,JPG 伴生也就
  // 几十 KB,保证分享路径稳定。失败不影响主流程(og 回落到显示版)。
  let share: ImageVariants["share"] = null;
  try {
    const jpg = await sharp(input.buffer, { failOn: "none" })
      .resize({ width: SHARE_MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    share = { buffer: jpg, mime: "image/jpeg" };
  } catch {
    /* 无伴生:og 回落到显示版(旧规则) */
  }

  return {
    display: { buffer: display, mime: "image/webp" },
    share,
    width: outMeta.width ?? 0,
    height: outMeta.height ?? 0,
  };
}
