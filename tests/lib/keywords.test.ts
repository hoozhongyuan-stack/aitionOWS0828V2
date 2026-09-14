import { describe, expect, it } from "vitest";
import { parseKeywords, MAX_KEYWORDS } from "@/lib/keywords";

/**
 * 关键词解析(V4.7.0)。后台「SEO 关键词」是自由文本输入(编辑页标注"逗号分隔"),
 * 实际录入会出现中英文逗号混用、顿号、分号、多余空格与重复项,这里统一清洗。
 */
describe("parseKeywords", () => {
  it("英文逗号分隔", () => {
    expect(parseKeywords("即时零售,私域,公域")).toEqual(["即时零售", "私域", "公域"]);
  });

  it("中文逗号/顿号/分号/中英混用都能切开", () => {
    expect(parseKeywords("即时零售，私域、公域；封坛酒,一物一码")).toEqual([
      "即时零售",
      "私域",
      "公域",
      "封坛酒",
      "一物一码",
    ]);
  });

  it("去掉首尾空白与空项", () => {
    expect(parseKeywords("  即时零售 ,, 私域 ，  ,公域  ")).toEqual(["即时零售", "私域", "公域"]);
  });

  it("重复项只保留一次(按原样,大小写敏感)", () => {
    expect(parseKeywords("私域,私域,Private,private")).toEqual(["私域", "Private", "private"]);
  });

  it("空值/全分隔符返回空数组", () => {
    expect(parseKeywords("")).toEqual([]);
    expect(parseKeywords(null)).toEqual([]);
    expect(parseKeywords(undefined)).toEqual([]);
    expect(parseKeywords(" ,，、; ")).toEqual([]);
  });

  it("超过上限时截断到 MAX_KEYWORDS", () => {
    const many = Array.from({ length: 30 }, (_, i) => `k${i}`).join(",");
    expect(parseKeywords(many)).toHaveLength(MAX_KEYWORDS);
    expect(parseKeywords(many)[MAX_KEYWORDS - 1]).toBe(`k${MAX_KEYWORDS - 1}`);
  });
});
