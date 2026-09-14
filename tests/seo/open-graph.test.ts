import { afterEach, describe, expect, it } from "vitest";

/**
 * buildOpenGraph 单元测试(V3.1 REQ-003/004 / NFR-002):
 * 图片兜底链=imagePath 绝对化→LOGO 绝对化→省略;标题解析;无相对路径输出。
 * LOGO 两端锁定:植入 logoUrl 断言精确 URL;清空 logoUrl 断言 images 省略。
 * V4.7.1:images 元素由字符串升级为 { url, width?, height? }(素材库有宽高时一并输出,
 *          供社交爬虫判定卡片版式;尺寸校验与兜底链单测见 tests/seo/share-image.test.ts)。
 */
describe("buildOpenGraph / resolveMetadataTitle", () => {
  const prevUrl = process.env.NEXT_PUBLIC_SITE_URL;

  afterEach(async () => {
    if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = prevUrl;
    const { prisma } = await import("@/lib/db");
    await prisma.setting.deleteMany({ where: { group: "brand", key: "logoUrl" } });
    const setting = await import("@/server/setting");
    setting.invalidateSettingCache("brand");
    await prisma.$disconnect();
  });

  async function setLogo(logoUrl: string) {
    const { prisma } = await import("@/lib/db");
    await prisma.setting.upsert({
      where: { group_key: { group: "brand", key: "logoUrl" } },
      update: { value: JSON.stringify(logoUrl) },
      create: { group: "brand", key: "logoUrl", value: JSON.stringify(logoUrl) },
    });
    const setting = await import("@/server/setting");
    setting.invalidateSettingCache("brand");
  }

  it("imagePath 相对路径 → 绝对 URL", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.com";
    const { buildOpenGraph } = await import("@/lib/seo/open-graph");
    const og = await buildOpenGraph({ title: "T", description: "D", imagePath: "/uploads/a.png", locale: "zh-CN" });
    const images = og.images as { url: string }[] | undefined;
    expect(images?.[0]?.url).toBe("https://example.com/uploads/a.png");
    expect(og.title).toBe("T");
    expect(og.locale).toBe("zh-CN");
  });

  it("无 imagePath 且配置了 LOGO → 精确的 LOGO 绝对 URL(兜底链中段)", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.com";
    await setLogo("/uploads/brand-logo.png");
    const { buildOpenGraph } = await import("@/lib/seo/open-graph");
    const og = await buildOpenGraph({ title: "T", imagePath: null, locale: "en" });
    const images = og.images as { url: string }[] | undefined;
    expect(images?.[0]?.url).toBe("https://example.com/uploads/brand-logo.png");
  });

  it("无 imagePath 且 LOGO 为空 → images 省略(兜底链末端)", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.com";
    await setLogo("");
    const { buildOpenGraph } = await import("@/lib/seo/open-graph");
    const og = await buildOpenGraph({ title: "T", imagePath: null, locale: "en" });
    expect(og.images).toBeUndefined();
  });

  it("已是绝对 URL 的 imagePath 原样保留", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.com";
    const { buildOpenGraph } = await import("@/lib/seo/open-graph");
    const og = await buildOpenGraph({ title: "T", imagePath: "https://cdn.example.com/x.png", locale: "en" });
    const images = og.images as { url: string }[] | undefined;
    expect(images?.[0]?.url).toBe("https://cdn.example.com/x.png");
  });

  it("resolveMetadataTitle:string/absolute/缺省三分支", async () => {
    const { resolveMetadataTitle } = await import("@/lib/seo/open-graph");
    expect(resolveMetadataTitle("abc", "FB")).toBe("abc");
    expect(resolveMetadataTitle({ absolute: "xyz" }, "FB")).toBe("xyz");
    expect(resolveMetadataTitle(null, "FB")).toBe("FB");
    expect(resolveMetadataTitle(undefined, "FB")).toBe("FB");
  });
});
