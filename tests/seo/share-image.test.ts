import { describe, expect, it, beforeEach } from "vitest";

/**
 * 分享图兜底链与尺寸校验(V4.7.1)。
 *
 * 背景:2026-09-14 实测「朋友圈无缩略图」——首页 og:image 兜底到 LOGO(600×180),
 * 高度不足微信要求的 300,朋友圈就退化成默认链接图标。修法是把兜底链改成
 * 「内容封面 → 默认分享图 → LOGO」并逐候选做尺寸校验(尺寸不足就换下一个)。
 */

const SITE = "https://share.test";

let prisma: typeof import("@/lib/db")["prisma"];
let pickShareImage: typeof import("@/lib/seo/open-graph")["pickShareImage"];
let MIN: number;

/**
 * 造一张素材(登记宽高)。统一加 share-test/ 前缀:测试库由全部测试文件共用且并行,
 * 这里只增删自己前缀下的数据,不碰其他文件的夹具(全局 deleteMany 会互相踩)。
 */
const PREFIX = "share-test/";
async function makeMedia(path: string, width: number | null, height: number | null) {
  const p = `${PREFIX}${path}`;
  await prisma.mediaAsset.create({
    data: { path: p, filename: path.split("/").pop() ?? path, mime: "image/png", size: 1000, width, height },
  });
  return `/uploads/${p}`;
}

beforeEach(async () => {
  ({ prisma } = await import("@/lib/db"));
  ({ pickShareImage, MIN_SHARE_IMAGE_SIDE: MIN } = await import("@/lib/seo/open-graph"));
  process.env.NEXT_PUBLIC_SITE_URL = SITE;
  await prisma.mediaAsset.deleteMany({ where: { path: { startsWith: PREFIX } } });
});

describe("pickShareImage 分享图兜底(V4.7.1)", () => {
  it("首候选尺寸合格时直接采用,并带出宽高", async () => {
    const url = await makeMedia("cover.png", 1200, 675);
    const r = await pickShareImage([url]);
    expect(r).toEqual({ url: `${SITE}${url}`, width: 1200, height: 675 });
  });

  it("封面尺寸不足(<300)时跳过,回退到默认分享图——朋友圈事故的直接回归锁", async () => {
    const tiny = await makeMedia("tiny.png", 200, 200);
    const fallback = await makeMedia("default-share.png", 1200, 630);
    const r = await pickShareImage([tiny, fallback]);
    expect(r?.url).toBe(`${SITE}${fallback}`);
    expect(r?.width).toBe(1200);
  });

  it("仅单边不足(600×180 的 LOGO 形态)同样被跳过——就是首页那次的实测尺寸", async () => {
    const logo = await makeMedia("logo.png", 600, 180);
    expect(await pickShareImage([logo])).toBeNull();
  });

  it("候选全不合格时返回 null(调用方省略 og:image,不硬塞一张不合格的图)", async () => {
    const a = await makeMedia("a.png", 100, 100);
    const b = await makeMedia("b.png", 250, 400);
    expect(await pickShareImage([a, b])).toBeNull();
  });

  it("data:/blob: 图片跳过(微信抓不到,首页演示商品封面就是 data: URI)", async () => {
    const dataUri = "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E";
    const real = await makeMedia("real.png", 1200, 630);
    expect(await pickShareImage([dataUri])).toBeNull();
    expect((await pickShareImage([dataUri, real]))?.url).toBe(`${SITE}${real}`);
  });

  it("尺寸未知(未登记素材/外链)放行:宁可给图也不要没图", async () => {
    const r1 = await pickShareImage([`/uploads/${PREFIX}not-in-library.png`]);
    expect(r1?.url).toBe(`${SITE}/uploads/${PREFIX}not-in-library.png`);
    expect(r1?.width).toBeUndefined();

    const external = "https://cdn.example.com/pic.png";
    expect((await pickShareImage([external]))?.url).toBe(external);
  });

  it("合格的候选优先于尺寸未知的候选(未知只作最后兜底)", async () => {
    const good = await makeMedia("good.png", 800, 800);
    const r = await pickShareImage([`/uploads/${PREFIX}unknown.png`, good]);
    expect(r?.url).toBe(`${SITE}${good}`);
    expect(r?.width).toBe(800);
  });

  it("素材登记了宽高但为 null(如视频/历史数据)→ 按未知放行", async () => {
    const legacy = await makeMedia("legacy.png", null, null);
    expect((await pickShareImage([legacy]))?.url).toBe(`${SITE}${legacy}`);
  });

  it("边界:恰好 300×300 视为合格", async () => {
    const edge = await makeMedia("edge.png", MIN, MIN);
    expect((await pickShareImage([edge]))?.width).toBe(MIN);
  });

  it("空候选/空字符串被忽略", async () => {
    expect(await pickShareImage([])).toBeNull();
    expect(await pickShareImage(["", null, undefined, "   "])).toBeNull();
  });
});
