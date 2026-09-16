import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { buildImageVariants } from "@/lib/storage/variants";

/** 造一张测试图(纯色 PNG,尺寸可控) */
async function makePng(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: { r: 120, g: 30, b: 60, alpha: 1 } } })
    .png()
    .toBuffer();
}

describe("buildImageVariants 上传压缩(V4.7.4)", () => {
  it("PNG 产出 WebP 显示版 + JPG 分享伴生,带尺寸", async () => {
    const buf = await makePng(1200, 675);
    const r = await buildImageVariants({ buffer: buf, mime: "image/png" });
    expect(r).not.toBeNull();
    const meta = await sharp(r!.display.buffer).metadata();
    expect(meta.format).toBe("webp");
    expect(r!.display.mime).toBe("image/webp");
    const sm = await sharp(r!.share!.buffer).metadata();
    expect(sm.format).toBe("jpeg");
    expect(r!.share!.mime).toBe("image/jpeg");
    expect(r!.width).toBe(1200);
    expect(r!.height).toBe(675);
  });

  it("超过 1600px 宽的图等比缩到 1600(只缩不放)", async () => {
    const buf = await makePng(2400, 1200);
    const r = await buildImageVariants({ buffer: buf, mime: "image/png" });
    const meta = await sharp(r!.display.buffer).metadata();
    expect(meta.width).toBe(1600);
    expect(meta.height).toBe(800);
    const sm = await sharp(r!.share!.buffer).metadata();
    expect(sm.width).toBe(1200);
  });

  it("gif/svg/ico 不处理(返回 null)", async () => {
    expect(await buildImageVariants({ buffer: Buffer.from("gif"), mime: "image/gif" })).toBeNull();
    expect(await buildImageVariants({ buffer: Buffer.from("<svg/>"), mime: "image/svg+xml" })).toBeNull();
    expect(await buildImageVariants({ buffer: Buffer.from("ico"), mime: "image/x-icon" })).toBeNull();
  });

  it("分享伴生 ≤1200px,且典型海报图压缩率显著(WebP 至少缩小到原图 1/3)", async () => {
    // 用带噪点的较大图模拟真实海报(纯色图压缩率失真地高,不利于断言)
    const base = await sharp({ create: { width: 1920, height: 1080, channels: 3, background: "#7a1c2e" } })
      .composite([{
        input: Buffer.from(
          `<svg width="1920" height="1080"><rect width="1920" height="1080" fill="none"/>${Array.from(
            { length: 200 },
            (_, i) => `<circle cx="${(i * 97) % 1920}" cy="${(i * 53) % 1080}" r="${8 + (i % 24)}" fill="hsl(${i * 7 % 360},60%,50%)"/>`
          ).join("")}</svg>`
        ),
        top: 0,
        left: 0,
      }])
      .png()
      .toBuffer();
    const r = await buildImageVariants({ buffer: base, mime: "image/png" });
    expect(r).not.toBeNull();
    expect(r!.display.buffer.length).toBeLessThan(base.length / 3);
    expect(r!.share!.buffer.length).toBeLessThan(base.length / 3);
  });
});
