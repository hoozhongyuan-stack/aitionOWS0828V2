import { describe, expect, it } from "vitest";

/**
 * TEST-004(对应 AC-003 / REQ-002):详情链接按栏目类型分流。
 * product 栏目内容走 /product/[slug],其余(article/news/case...)沿用 /article/[slug]。
 * 纯函数单元测试,不依赖数据库。
 */

describe("TEST-004:resolveContentDetailPath 按栏目类型分流", () => {
  it("product → /{locale}/product/{slug}", async () => {
    const { resolveContentDetailPath } = await import("@/server/content");
    expect(resolveContentDetailPath("product", "ax-100", "zh-CN")).toBe("/zh-CN/product/ax-100");
    expect(resolveContentDetailPath("product", "widget", "en")).toBe("/en/product/widget");
  });

  it("article → /{locale}/article/{slug}(存量行为不变)", async () => {
    const { resolveContentDetailPath } = await import("@/server/content");
    expect(resolveContentDetailPath("article", "hello-world", "zh-CN")).toBe(
      "/zh-CN/article/hello-world"
    );
  });

  it("其他模块类型(news/case 等)统一回退 /article/", async () => {
    const { resolveContentDetailPath } = await import("@/server/content");
    expect(resolveContentDetailPath("news", "n-1", "en")).toBe("/en/article/n-1");
    expect(resolveContentDetailPath("case", "c-1", "zh-CN")).toBe("/zh-CN/article/c-1");
    expect(resolveContentDetailPath("", "x", "en")).toBe("/en/article/x");
  });
});
