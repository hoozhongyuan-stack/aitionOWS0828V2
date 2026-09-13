import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminSelect } from "@/components/admin/admin-select";

/**
 * 统一后台下拉组件(V4.6.5)。
 *
 * 这里锁的核心是「空字符串是一等公民」——后台筛选器普遍用 "" 表达「全部」,
 * 而 Radix Select 的 SelectItem 不接受 value="",这正是本组件自研而非引入
 * Radix 的原因;若哪天有人改成 Radix,这条断言会立刻失败。
 */
describe("AdminSelect 统一下拉", () => {
  const options = [
    { value: "", label: "全部商品栏目" },
    { value: "1", label: "酒水渠道" },
    { value: "2", label: "一个特别长的栏目名称用来验证截断与 title 兜底" },
  ];

  it("value='' 时显示空值选项的文案(而非 placeholder)", () => {
    const html = renderToStaticMarkup(
      <AdminSelect value="" onChange={() => {}} options={options} placeholder="请选择" />
    );
    expect(html).toContain("全部商品栏目");
    expect(html).not.toContain("请选择");
  });

  it("选中项显示对应 label,长 label 带 title 兜底(不撑破容器)", () => {
    const html = renderToStaticMarkup(
      <AdminSelect value="2" onChange={() => {}} options={options} />
    );
    expect(html).toContain("一个特别长的栏目名称用来验证截断与 title 兜底");
    expect(html).toContain('title="一个特别长的栏目名称用来验证截断与 title 兜底"');
    expect(html).toContain("truncate");
  });

  it("value 不在选项中时回退到 placeholder 并置灰", () => {
    const html = renderToStaticMarkup(
      <AdminSelect value="404" onChange={() => {}} options={options} placeholder="请选择" />
    );
    expect(html).toContain("请选择");
    expect(html).toContain("text-muted-foreground");
  });

  it("触发器具备 combobox 语义(aria-expanded/aria-controls/haspopup)", () => {
    const html = renderToStaticMarkup(
      <AdminSelect value="" onChange={() => {}} options={options} aria-label="栏目筛选" />
    );
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain("aria-controls=");
    expect(html).toContain('aria-label="栏目筛选"');
  });

  it("disabled 时按钮不可点", () => {
    const html = renderToStaticMarkup(
      <AdminSelect value="" onChange={() => {}} options={options} disabled />
    );
    expect(html).toContain("disabled");
    expect(html).toContain("disabled:opacity-50");
  });
});
