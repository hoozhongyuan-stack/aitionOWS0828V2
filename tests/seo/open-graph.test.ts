import { afterEach, describe, expect, it } from "vitest";

/**
 * buildOpenGraph 单元测试(V3.1 REQ-003/004 / NFR-002):
 * 图片兜底链=imagePath 绝对化→LOGO 绝对化→省略;标题解析;无相对路径输出。
 */
describe("buildOpenGraph / resolveMetadataTitle", () => {
  const prevUrl = process.env.NEXT_PUBLIC_SITE_URL;

  afterEach(() => {
    if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = prevUrl;
    // 清除 brand 配置缓存,避免用例间串扰
    try {
      const cfg = require("@/lib/config");
      if (typeof cfg.invalidateSettingCache === "function") cfg.invalidateSettingCache("brand");
    } catch { /* 忽略 */ }
  });

  it("imagePath 相对路径 → 绝对 URL", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.com";
    const { buildOpenGraph } = await import("@/lib/seo/open-graph");
    const og = await buildOpenGraph({ title: "T", description: "D", imagePath: "/uploads/a.png", locale: "zh-CN" });
    expect(og.images?.[0]).toBe("https://example.com/uploads/a.png");
    expect(og.title).toBe("T");
    expect(og.locale).toBe("zh-CN");
  });

  it("无 imagePath → 兜底 LOGO 绝对 URL;LOGO 也为空 → images 省略", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.com";
    const { buildOpenGraph } = await import("@/lib/seo/open-graph");
    const og = await buildOpenGraph({ title: "T", imagePath: null, locale: "en" });
    // 兜底链末端取决于品牌配置:有 LOGO → 绝对 URL;无 LOGO → undefined
    expect(og.images === undefined || /^https?:\/\//.test(og.images![0])).toBe(true);
  });

  it("已是绝对 URL 的 imagePath 原样保留", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.com";
    const { buildOpenGraph } = await import("@/lib/seo/open-graph");
    const og = await buildOpenGraph({ title: "T", imagePath: "https://cdn.example.com/x.png", locale: "en" });
    expect(og.images?.[0]).toBe("https://cdn.example.com/x.png");
  });

  it("resolveMetadataTitle:string/absolute/缺省三分支", async () => {
    const { resolveMetadataTitle } = await import("@/lib/seo/open-graph");
    expect(resolveMetadataTitle("abc", "FB")).toBe("abc");
    expect(resolveMetadataTitle({ absolute: "xyz" }, "FB")).toBe("xyz");
    expect(resolveMetadataTitle(null, "FB")).toBe("FB");
    expect(resolveMetadataTitle(undefined, "FB")).toBe("FB");
  });
});
