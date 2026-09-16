import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OrganizationJsonLd } from "@/components/seo/json-ld";

/**
 * Organization 结构化数据增强(V4.7.3):identifier(备案号)/ description(定位)/
 * sameAs(外部主页)/ 地址单一事实来源(品牌信息优先)。
 * 背景:AI 对"站点是否可信"的判断依赖页面证据,此前结构化数据里没有"我是谁、做什么、
 * 有何官方登记",且地址与页脚互相矛盾。
 */
const base = {
  siteName: "数字中圆",
  siteUrl: "https://share.test",
  logoUrl: "/logo.png",
  phone: "400-000-0000",
  email: "hi@test.cn",
  seo: { city: "深圳市", address: "旧地址(应被品牌地址覆盖)", lat: "", lng: "", serviceArea: "中国" },
};

function render(props: Partial<Parameters<typeof OrganizationJsonLd>[0]> = {}) {
  const html = renderToStaticMarkup(<OrganizationJsonLd {...base} {...props} />);
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  return JSON.parse(m![1]) as Record<string, unknown>;
}

describe("OrganizationJsonLd 信任字段(V4.7.3)", () => {
  it("备案号输出为 identifier(PropertyValue),定位输出为 description", () => {
    const d = render({ tagline: "酒业数智增长观察站", icp: "粤ICP备2026086168号" });
    expect(d.description).toBe("酒业数智增长观察站");
    expect(d.identifier).toEqual({ "@type": "PropertyValue", name: "ICP备案号", value: "粤ICP备2026086168号" });
  });

  it("streetAddress 以品牌地址(单一事实来源)为准,SEO.address 不再参与;city 仍生效", () => {
    const d = render({ contactAddress: "龙岗区宝龙四路2号安博创新产业园2号楼1408A" }) as {
      address: { streetAddress: string; addressLocality: string };
    };
    expect(d.address.streetAddress).toBe("龙岗区宝龙四路2号安博创新产业园2号楼1408A");
    expect(d.address.streetAddress).not.toContain("旧地址");
    expect(d.address.addressLocality).toBe("深圳市");
  });

  it("未传品牌地址时回落 SEO.address(历史数据兼容)", () => {
    const d = render() as { address: { streetAddress: string } };
    expect(d.address.streetAddress).toContain("旧地址");
  });

  it("sameAs 输出外部主页;空数组不输出该字段", () => {
    const withSame = render({ sameAs: ["https://mp.weixin.qq.com/mp/profile_ext?action=home&__biz=x"] });
    expect(withSame.sameAs).toEqual(["https://mp.weixin.qq.com/mp/profile_ext?action=home&__biz=x"]);
    const without = render({});
    expect("sameAs" in without).toBe(false);
  });

  it("未填 tagline/icp 时对应字段省略(不输出空值)", () => {
    const d = render({});
    expect("description" in d).toBe(false);
    expect("identifier" in d).toBe(false);
  });
});
