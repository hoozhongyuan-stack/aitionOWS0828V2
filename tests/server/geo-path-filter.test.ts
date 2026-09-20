import { describe, expect, it } from "vitest";
import { isGeoRecordablePath } from "@/server/geo";

/**
 * GEO 记录点路径过滤(V4.8.2 修复)。
 *
 * 回归背景:原先用子串正则 /\/admin|\/_next|\/uploads|\/api/ 判断,把 slug 里含
 * api/admin/uploads 的正常内容页也排除了(如 /zh-CN/article/api-design),导致这些页面
 * 的 AI 抓取与引荐**静默不记录**。现在按 locale 之后的第一段判断。
 */

const L = "zh-CN";

describe("正常内容页一律可记录(此前的误伤点)", () => {
  it("slug 含 api 的文章正常记录", () => {
    expect(isGeoRecordablePath("/zh-CN/article/api-design", L)).toBe(true);
  });

  it("slug 以 api 开头的栏目正常记录", () => {
    expect(isGeoRecordablePath("/zh-CN/c/api-case", L)).toBe(true);
  });

  it("slug 含 admin 的文章正常记录", () => {
    expect(isGeoRecordablePath("/zh-CN/article/admin-guide", L)).toBe(true);
  });

  it("slug 含 uploads 的栏目正常记录", () => {
    expect(isGeoRecordablePath("/zh-CN/c/uploads-guide", L)).toBe(true);
  });

  it("第一段正好叫 api 的内容页(路由段判定才做得到)", () => {
    expect(isGeoRecordablePath("/zh-CN/article/api", L)).toBe(true);
    expect(isGeoRecordablePath("/zh-CN/c/admin", L)).toBe(true);
  });

  it("英文站同理", () => {
    expect(isGeoRecordablePath("/en/c/uploads-guide", L)).toBe(true);
    expect(isGeoRecordablePath("/en", "en")).toBe(true);
  });

  it("首页与栏目首页", () => {
    expect(isGeoRecordablePath("/zh-CN", L)).toBe(true);
    expect(isGeoRecordablePath("/zh-CN/", L)).toBe(true);
    expect(isGeoRecordablePath("/zh-CN/search", L)).toBe(true);
  });
});

describe("后台与静态/接口路径仍被排除", () => {
  it("后台各页", () => {
    expect(isGeoRecordablePath("/zh-CN/admin", L)).toBe(false);
    expect(isGeoRecordablePath("/zh-CN/admin/content", L)).toBe(false);
    expect(isGeoRecordablePath("/en/admin/geo-monitor", "en")).toBe(false);
  });

  it("接口路径", () => {
    expect(isGeoRecordablePath("/zh-CN/api/track", L)).toBe(false);
    expect(isGeoRecordablePath("/api/track", L)).toBe(false);
  });

  it("静态资源", () => {
    expect(isGeoRecordablePath("/_next/static/chunk.js", L)).toBe(false);
    expect(isGeoRecordablePath("/uploads/2026/09/pic.webp", L)).toBe(false);
  });
});
