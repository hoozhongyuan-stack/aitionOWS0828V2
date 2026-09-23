// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FloatingActions } from "@/components/site/floating-actions";
import type { FloatingItem } from "@/lib/floating";

/**
 * 右侧悬浮入口组件(V4.8.3)。
 * 锁住:三种入口的渲染与点击行为(tel 走原生链接、二维码/表单走弹层)、
 * 未配置不渲染、弹层关闭方式(Esc / 遮罩)。
 *
 * 表单弹层里的 FormRenderer 用桩替换(它依赖 next-intl 的 Provider,与本次改动无关)。
 */
vi.mock("@/components/site/form-renderer", () => ({
  FormRenderer: ({ slug, title, fields }: { slug: string; title: string; fields: unknown[] }) => (
    <div data-testid="form-stub">{`${title}|${slug}|${fields.length}`}</div>
  ),
}));

const labels = { open: "联系我们", close: "关闭", loading: "加载中…", loadFailed: "表单暂时无法加载" };

const TEL_ITEM: FloatingItem = {
  key: "tel-0",
  type: "tel",
  iconUrl: "/uploads/tel.png",
  label: "电话咨询",
  href: "tel:0755-12345678",
};
const QR_ITEM: FloatingItem = {
  key: "qrcode-1",
  type: "qrcode",
  iconUrl: "/uploads/wechat.png",
  label: "微信咨询",
  qrcodeUrl: "/uploads/qr.png",
};
const FORM_ITEM: FloatingItem = {
  key: "form-0",
  type: "form",
  iconUrl: "/uploads/form.png",
  label: "在线留言",
  form: { slug: "contact", name: "联系我们" },
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

async function mount(items: FloatingItem[]) {
  await act(async () => {
    root.render(<FloatingActions items={items} labels={labels} />);
  });
}

function clickButtonByLabel(name: string) {
  const btn = Array.from(document.body.querySelectorAll("button")).find(
    (b) => b.getAttribute("aria-label") === name
  );
  if (!btn) throw new Error(`未找到按钮:${name}`);
  return btn as HTMLButtonElement;
}

describe("渲染", () => {
  it("未配置任何入口 → 不渲染任何悬浮元素(存量站点零变化)", async () => {
    await mount([]);
    expect(container.innerHTML).toBe("");
  });

  it("电话项渲染为原生拨号链接(移动端点按即拨打,不依赖 JS)", async () => {
    await mount([TEL_ITEM]);
    const link = body().querySelector<HTMLAnchorElement>('a[href="tel:0755-12345678"]');
    expect(link).not.toBeNull();
    expect(link!.getAttribute("aria-label")).toBe("电话咨询");
    // 图标来自后台配置
    expect(link!.querySelector("img")?.getAttribute("src")).toBe("/uploads/tel.png");
  });

  it("最多两条各渲染一个按钮(桌面竖排 + 移动端圆钮)", async () => {
    await mount([TEL_ITEM, QR_ITEM]);
    // 桌面容器里两个图标按钮
    expect(body().querySelectorAll('a[href^="tel:"], button[aria-label="微信咨询"]').length).toBe(2);
    // 移动端圆钮
    expect(body().querySelector('button[aria-expanded]')).not.toBeNull();
  });
});

function body() {
  return document.body;
}

describe("二维码弹层", () => {
  it("点击二维码入口 → 弹层展示大图与提示文字", async () => {
    await mount([QR_ITEM]);
    await act(async () => clickButtonByLabel("微信咨询").click());
    const dialog = body().querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.querySelector("img")?.getAttribute("src")).toBe("/uploads/qr.png");
    expect(dialog!.textContent).toContain("微信咨询");
  });

  it("Esc 关闭弹层", async () => {
    await mount([QR_ITEM]);
    await act(async () => clickButtonByLabel("微信咨询").click());
    expect(body().querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(body().querySelector('[role="dialog"]')).toBeNull();
  });

  it("点击遮罩关闭弹层", async () => {
    await mount([QR_ITEM]);
    await act(async () => clickButtonByLabel("微信咨询").click());
    const dialog = body().querySelector<HTMLElement>('[role="dialog"]')!;
    await act(async () => dialog.click());
    expect(body().querySelector('[role="dialog"]')).toBeNull();
  });
});

describe("表单弹层", () => {
  it("点击表单项 → 拉取公开表单结构并就地渲染(不跳页)", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ ok: true, data: { slug: "contact", name: "联系我们", fields: [{ id: "a" }, { id: "b" }] } }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    await mount([FORM_ITEM]);
    await act(async () => clickButtonByLabel("在线留言").click());
    // 先出加载态,再渲染表单
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/form/contact", { cache: "no-store" });
    expect(body().querySelector('[data-testid="form-stub"]')?.textContent).toBe("联系我们|contact|2");
  });

  it("接口 404(表单被停用)→ 显示友好提示而不是空白弹层", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: false, message: "表单不存在或未启用" }), { status: 404 }))
    );
    await mount([FORM_ITEM]);
    await act(async () => clickButtonByLabel("在线留言").click());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(body().querySelector('[role="dialog"]')?.textContent).toContain("表单暂时无法加载");
  });
});
