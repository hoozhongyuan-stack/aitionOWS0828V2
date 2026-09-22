import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * 上传分享伴生命名回归锁(V4.8.4 修)。
 *
 * 背景:V4.7.4 起上传生成 JPG 分享伴生,但物理路径用独立 UUID 命名;而 og:image 的
 * 伴生匹配只认 <stem>-share.jpg / <stem>.jpg(open-graph.ts,与回填脚本同约定)
 * → 新上传封面的 og 永远匹配不到伴生,微信分享卡退化用 WebP 本体或兜底图。
 * 本文件锁住:伴生物理路径 = <显示版stem>-share.jpg,且经 pickShareImage 全链路可命中。
 *
 * 注意:saveUpload 写盘位置由 UPLOAD_DIR 决定,测试重定向到临时目录,不污染项目 uploads/。
 */

let tmpUploadDir = "";

beforeAll(async () => {
  tmpUploadDir = await mkdtemp(path.join(tmpdir(), "aition-upload-test-"));
  process.env.UPLOAD_DIR = tmpUploadDir;
});

afterAll(async () => {
  delete process.env.UPLOAD_DIR;
  if (tmpUploadDir) await rm(tmpUploadDir, { recursive: true, force: true });
});

async function makePng(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: { r: 120, g: 30, b: 60, alpha: 1 } } })
    .png()
    .toBuffer();
}

describe("上传伴生 <stem>-share.jpg 命名与 og 全链路(V4.8.4)", () => {
  it("saveUpload:伴生物理路径 = 显示版同 stem + -share.jpg,同目录,文件真实落盘", async () => {
    const { saveUpload, uploadRoot, fileSize } = await import("@/lib/storage");
    const saved = await saveUpload({
      buffer: await makePng(1200, 675),
      originalName: "海报.png",
      mime: "image/png",
    });
    expect(saved.mime).toBe("image/webp"); // 显示版转 WebP
    expect(saved.shareRelPath).toBeTruthy();
    const stem = saved.relPath.replace(/\.webp$/, "");
    expect(saved.shareRelPath).toBe(`${stem}-share.jpg`); // 核心断言:与 og 匹配约定一致
    expect(path.dirname(saved.shareRelPath!)).toBe(path.dirname(saved.relPath)); // 同目录
    // 物理文件真实存在
    expect(await fileSize(path.join(uploadRoot(), saved.shareRelPath!))).toBeGreaterThan(0);
  });

  it("createMedia 登记 + pickShareImage:webp 封面的 og:image 命中 -share.jpg 伴生(端到端)", async () => {
    const { createMedia } = await import("@/server/media");
    const { pickShareImage, MIN_SHARE_IMAGE_SIDE } = await import("@/lib/seo/open-graph");
    const asset = await createMedia(
      { buffer: await makePng(MIN_SHARE_IMAGE_SIDE + 100, MIN_SHARE_IMAGE_SIDE + 100), originalName: "cover.png", mime: "image/png" },
      { uploaderType: "admin", uploaderId: 1 }
    );
    expect(asset.shareUrl).toBeTruthy();
    // 资产登记就位(og 查 dims 依赖 MediaAsset 行)
    expect(asset.url.endsWith(".webp")).toBe(true);
    // 全链路:og 候选给 webp 封面 URL → 返回 JPG 伴生 URL(而非 webp 本体;pickShareImage 返回绝对 URL)
    const picked = await pickShareImage([asset.url]);
    expect(picked).not.toBeNull();
    expect(picked!.url).toBe(`http://localhost:3000${asset.shareUrl}`);
    // 伴生登记行也用了 -share 展示名(素材库口径一致)
    const { prisma } = await import("@/lib/db");
    const shareRow = await prisma.mediaAsset.findFirst({ where: { path: asset.shareUrl!.replace("/uploads/", "") } });
    expect(shareRow?.filename.endsWith("-share.jpg")).toBe(true);
    await prisma.mediaAsset.deleteMany({ where: { path: { in: [asset.url.replace("/uploads/", ""), asset.shareUrl!.replace("/uploads/", "")] } } });
  });
});
