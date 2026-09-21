import { describe, expect, it } from "vitest";
import { MAX_FLOATING_ENTRIES, telHref, normalizeFloatingEntries, buildFloatingItems } from "@/lib/floating";

/**
 * 右侧悬浮入口的纯逻辑(V4.8.3)。
 * 这里锁三件事:号码净化(生成安全的 tel: 链接)、脏配置清洗(不留空按钮)、条数封顶(最多 2 条)。
 */

describe("telHref:号码净化", () => {
  it("纯数字与常见分隔符都保留", () => {
    expect(telHref("18688720565")).toBe("tel:18688720565");
    expect(telHref("+86 186-8872 0565")).toBe("tel:+86 186-8872 0565");
    expect(telHref("(0755) 1234-5678")).toBe("tel:(0755) 1234-5678");
  });

  it("字母等杂字符被剔除(含伪协议)", () => {
    expect(telHref("javascript:alert(1)")).toBe("tel:(1)");
    expect(telHref("电话:18688720565")).toBe("tel:18688720565");
  });

  it("没有数字 → 视为无效(返回空串,该条不渲染)", () => {
    expect(telHref("")).toBe("");
    expect(telHref("   ")).toBe("");
    expect(telHref("abc")).toBe("");
  });
});

describe("normalizeFloatingEntries:脏配置清洗", () => {
  it("配置完整的三种类型都保留", () => {
    const out = normalizeFloatingEntries([
      { type: "tel", iconUrl: "/uploads/a.png", label: "电话咨询", tel: "18688720565" },
      { type: "qrcode", iconUrl: "/uploads/b.png", label: "微信", qrcodeUrl: "/uploads/qr.png" },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].type).toBe("tel");
    expect(out[1].qrcodeUrl).toBe("/uploads/qr.png");
  });

  it("缺图标的条目被丢弃(避免渲染空按钮)", () => {
    expect(normalizeFloatingEntries([{ type: "tel", iconUrl: "", tel: "18688720565" }])).toEqual([]);
  });

  it("各类型缺关键字段都被丢弃", () => {
    expect(normalizeFloatingEntries([{ type: "tel", iconUrl: "/a.png", tel: "abc" }])).toEqual([]);
    expect(normalizeFloatingEntries([{ type: "form", iconUrl: "/a.png" }])).toEqual([]);
    expect(normalizeFloatingEntries([{ type: "qrcode", iconUrl: "/a.png" }])).toEqual([]);
  });

  it("未知类型被丢弃", () => {
    expect(normalizeFloatingEntries([{ type: "wechat", iconUrl: "/a.png" }])).toEqual([]);
  });

  it("超过 2 条只保留前 2 条", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      type: "tel",
      iconUrl: `/uploads/${i}.png`,
      tel: `1000000000${i}`,
    }));
    expect(normalizeFloatingEntries(many)).toHaveLength(MAX_FLOATING_ENTRIES);
  });

  it("非数组/脏输入安全返回空数组", () => {
    expect(normalizeFloatingEntries(null)).toEqual([]);
    expect(normalizeFloatingEntries("x")).toEqual([]);
    expect(normalizeFloatingEntries([null, 1, "a"])).toEqual([]);
  });

  it("提示文字截断到 20 字(防止撑破悬浮条)", () => {
    const long = "这是一段特别特别特别特别特别特别长的提示文字";
    const out = normalizeFloatingEntries([{ type: "tel", iconUrl: "/a.png", tel: "123", label: long }]);
    expect(out[0].label.length).toBe(20);
  });
});

describe("buildFloatingItems:交给前端的形态", () => {
  const forms = new Map([[7, { slug: "contact", name: "联系我们" }]]);

  it("form 项解析出表单 slug 与名称", () => {
    const items = buildFloatingItems(
      [{ type: "form", iconUrl: "/a.png", label: "留言", formId: 7 }],
      forms
    );
    expect(items[0].form).toEqual({ slug: "contact", name: "联系我们" });
  });

  it("关联的表单已停用/被删除 → 该入口自动消失(不留死链)", () => {
    const items = buildFloatingItems(
      [{ type: "form", iconUrl: "/a.png", label: "留言", formId: 999 }],
      forms
    );
    expect(items).toEqual([]);
  });

  it("tel 项生成拨号链接,qrcode 项带出图片地址", () => {
    const items = buildFloatingItems(
      [
        { type: "tel", iconUrl: "/a.png", label: "电话", tel: "+86 186-8872 0565" },
        { type: "qrcode", iconUrl: "/b.png", label: "微信", qrcodeUrl: "/qr.png" },
      ],
      forms
    );
    expect(items[0].href).toBe("tel:+86 186-8872 0565");
    expect(items[1].qrcodeUrl).toBe("/qr.png");
    expect(items.map((i) => i.key)).toEqual(["tel-0", "qrcode-1"]);
  });
});
