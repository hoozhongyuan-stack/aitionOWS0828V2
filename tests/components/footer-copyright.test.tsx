import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteFooter } from "@/components/site/footer";
import { getBrandConfig } from "@/lib/config";

/**
 * 页脚版权跳转链接(V4.8.3)。
 *
 * 背景:版权文字此前被写死包在指向模板作者官网的 <a href="https://www.aition.art"> 里
 * (V4.0.2 遗留)—— 部署到客户站点后是个错误外链。现在链接由后台配置:
 * 留空 → 纯文本;填了 → 可点击;非 http/https(如 javascript:)→ 拒绝,回落纯文本。
 */

async function renderFooter(over: Record<string, unknown> = {}) {
  const brand = { ...(await getBrandConfig()), ...over };
  return renderToStaticMarkup(
    <SiteFooter
      brand={brand}
      locale="zh-CN"
      labels={{ register: "用户注册协议", privacy: "隐私政策", cookies: "Cookie 政策", contact: "联系我们" }}
    />
  );
}

describe("版权跳转链接", () => {
  it("配置了链接:版权文字渲染为可点击的 a 标签(target=_blank + noopener)", async () => {
    const html = await renderFooter({
      copyright: "© 2026 数字中圆 · 粤ICP备2026086168号",
      copyrightUrl: "https://www.example.com",
    });
    expect(html).toContain('href="https://www.example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("noopener");
    expect(html).toContain("数字中圆");
  });

  it("未配置链接:渲染为纯文本,不含指向任何外站的 a 标签(不再写死旧域名)", async () => {
    const html = await renderFooter({ copyright: "© 2026 数字中圆", copyrightUrl: "" });
    expect(html).toContain("© 2026 数字中圆");
    expect(html).not.toContain("aition.art");
    expect(html).not.toContain("<a class=\"block\"");
  });

  it("非 http/https 的链接被拒绝(防 javascript: 之类),回落纯文本", async () => {
    const html = await renderFooter({
      copyright: "© 2026 数字中圆",
      copyrightUrl: "javascript:alert(1)",
    });
    expect(html).not.toContain("javascript:");
    expect(html).toContain("© 2026 数字中圆");
  });

  it("http 明文链接也放行(内网/未配证书的自建站场景)", async () => {
    const html = await renderFooter({ copyright: "© 2026 X", copyrightUrl: "http://intranet.local/x" });
    expect(html).toContain('href="http://intranet.local/x"');
  });

  it("未填版权文字时沿用「© 年 站点名」中性兜底", async () => {
    const html = await renderFooter({ copyright: "", siteName: "示例站点" });
    expect(html).toContain("©");
    expect(html).toContain("示例站点");
  });

  it("备案号始终保持纯文本外链(合规要求,与版权链接互不影响)", async () => {
    const html = await renderFooter({ icp: "粤ICP备2026086168号-2", copyrightUrl: "" });
    expect(html).toContain("beian.miit.gov.cn");
  });
});

describe("品牌配置默认值", () => {
  it("新字段有安全兜底(未配置不报错、不产生链接)", async () => {
    const brand = await getBrandConfig();
    expect(brand.copyrightUrl).toBe("");
    expect(brand.supportEmail).toBe("");
  });
});
