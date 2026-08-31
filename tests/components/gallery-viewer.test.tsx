import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GalleryViewer } from "@/components/site/gallery-viewer";

/**
 * 商品图集切换组件(TEST-020,DEF-010):
 * - 服务端渲染首图为主图 + 全部缩略图(禁 JS 可见全部图,NFR-002 不回退)
 * - 缩略图为 button,带 aria-label 与选中态标记(客户端点击切换主图)
 */
describe("GalleryViewer 商品图集切换", () => {
  const images = [
    { url: "/uploads/a.png", alt: "商品A" },
    { url: "/uploads/b.png", alt: "商品B" },
    { url: "/uploads/c.png", alt: "商品C" },
  ];

  it("渲染主图(首图)与全部缩略图", () => {
    const html = renderToStaticMarkup(<GalleryViewer images={images} alt="演示商品" />);
    expect(html).toContain('/uploads/a.png');
    expect(html).toContain('/uploads/b.png');
    expect(html).toContain('/uploads/c.png');
  });

  it("缩略图为 button 且带 aria-label,单图时不渲染缩略图区", () => {
    const html = renderToStaticMarkup(<GalleryViewer images={images} alt="演示商品" />);
    expect((html.match(/<button /g) || []).length).toBe(3);
    expect(html).toContain('aria-label="查看第 2 张"');
    const single = renderToStaticMarkup(
      <GalleryViewer images={[images[0]]} alt="演示商品" />
    );
    expect((single.match(/<button /g) || []).length).toBe(0);
  });

  it("默认选中第 1 张(aria-current 标记)", () => {
    const html = renderToStaticMarkup(<GalleryViewer images={images} alt="演示商品" />);
    expect((html.match(/aria-current="true"/g) || []).length).toBe(1);
  });
});
