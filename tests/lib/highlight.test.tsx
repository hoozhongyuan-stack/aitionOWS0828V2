import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { highlightText } from "@/lib/highlight";

/**
 * 搜索命中高亮(V4.7.2):按 React 切片渲染,不拼 HTML 字符串。
 * 这里锁住:多次命中、大小写不敏感(保留原文大小写)、空关键词原样返回,
 * 以及"关键词含 HTML 时不会被当成标签执行"(切片渲染天然免疫)。
 */
const html = (text: string | null, kw: string) => renderToStaticMarkup(<>{highlightText(text, kw)}</>);

describe("highlightText 命中高亮", () => {
  it("单次命中包成 mark", () => {
    expect(html("即时零售增长", "即时零售")).toBe("即时零售增长".replace("即时零售", "<mark class=\"rounded bg-primary/15 px-0.5 text-foreground\">即时零售</mark>"));
  });

  it("多次命中各自包一层", () => {
    const out = html("私域运营与私域复购", "私域");
    expect((out.match(/<mark/g) || []).length).toBe(2);
  });

  it("英文大小写不敏感,但保留原文大小写", () => {
    const out = html("DeepSeek 与 deepseek", "deepseek");
    expect((out.match(/<mark/g) || []).length).toBe(2);
    expect(out).toContain(">DeepSeek<");
    expect(out).toContain(">deepseek<");
  });

  it("空关键词/空文本原样返回(不产生 mark)", () => {
    expect(html("即时零售", "")).toBe("即时零售");
    expect(html(null, "即时零售")).toBe("");
    expect(html("即时零售", "   ")).toBe("即时零售");
  });

  it("未命中时原样返回", () => {
    expect(html("封坛酒方案", "即时零售")).toBe("封坛酒方案");
  });

  it("关键词含尖括号时按纯文本处理,不生成标签", () => {
    const out = html("危险 <script> 内容", "<script>");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });
});
