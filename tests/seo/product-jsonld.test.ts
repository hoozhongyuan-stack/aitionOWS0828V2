import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductJsonLd } from "@/components/seo/json-ld";

/**
 * TEST-006(对应 AC-005 / REQ-004):Product JSON-LD 结构化数据——
 * 纯组件函数级断言:渲染输出 JSON-LD script,JSON.parse 后校验字段。
 * - name/description/url 基础字段
 * - image 相对路径用站点 URL 绝对化(与 ArticleJsonLd 同机制)
 * - brand(品牌 = 站点名)/ category 输出
 * - specs 含 k 为「型号」的键值时输出 sku;无型号不输出
 */

const PREV_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

beforeAll(() => {
  // 组件在调用时读取环境变量,统一固定 base 以断言绝对 URL
  process.env.NEXT_PUBLIC_SITE_URL = "https://seo.example.com";
});

afterAll(() => {
  if (PREV_SITE_URL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = PREV_SITE_URL;
});

/** 渲染组件并解析 JSON-LD script 内容 */
function renderLd(props: Parameters<typeof ProductJsonLd>[0]): Record<string, unknown> {
  const html = renderToStaticMarkup(ProductJsonLd(props));
  const m = html.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  expect(m, "应渲染出 application/ld+json script").toBeTruthy();
  return JSON.parse(m![1]);
}

describe("TEST-006:Product JSON-LD 结构化数据", () => {
  it("输出 @type=Product 与 name/description/url,image 相对路径绝对化", () => {
    const ld = renderLd({
      name: "智能网关 AX-100",
      description: "工业级智能网关,支持多协议接入。",
      image: "/uploads/ax100.webp",
      url: "https://seo.example.com/zh-CN/product/ax100",
    });
    expect(ld["@type"]).toBe("Product");
    expect(ld.name).toBe("智能网关 AX-100");
    expect(ld.description).toBe("工业级智能网关,支持多协议接入。");
    expect(ld.url).toBe("https://seo.example.com/zh-CN/product/ax100");
    expect(ld.image).toBe("https://seo.example.com/uploads/ax100.webp");
  });

  it("image 支持图集数组且逐项绝对化", () => {
    const ld = renderLd({
      name: "商品",
      description: "描述",
      image: ["/uploads/g1.webp", "https://cdn.example.com/g2.webp"],
      url: "https://seo.example.com/zh-CN/product/p1",
    });
    expect(ld.image).toEqual([
      "https://seo.example.com/uploads/g1.webp",
      "https://cdn.example.com/g2.webp",
    ]);
  });

  it("输出 brand(品牌)与 category 字段", () => {
    const ld = renderLd({
      name: "商品",
      description: "描述",
      image: null,
      url: "https://seo.example.com/zh-CN/product/p1",
      brand: "AitionOWS",
      category: "产品中心",
    });
    expect(ld.brand).toEqual({ "@type": "Brand", name: "AitionOWS" });
    expect(ld.category).toBe("产品中心");
  });

  it("specs 含「型号」键值时输出 sku;无「型号」时不输出 sku", () => {
    const withModel = renderLd({
      name: "商品",
      description: "描述",
      image: null,
      url: "https://seo.example.com/zh-CN/product/p1",
      specs: [
        { k: "型号", v: "AX-100" },
        { k: "重量", v: "2kg" },
      ],
    });
    expect(withModel.sku).toBe("AX-100");

    const withoutModel = renderLd({
      name: "商品",
      description: "描述",
      image: null,
      url: "https://seo.example.com/zh-CN/product/p1",
      specs: [{ k: "重量", v: "2kg" }],
    });
    expect("sku" in withoutModel).toBe(false);
  });

  it("image 为 null 时省略 image 字段,不抛错", () => {
    const ld = renderLd({
      name: "商品",
      description: "描述",
      image: null,
      url: "https://seo.example.com/zh-CN/product/p1",
    });
    expect("image" in ld).toBe(false);
  });
});
