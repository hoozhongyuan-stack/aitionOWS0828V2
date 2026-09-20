// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Toaster } from "sonner";
import { RichTextEditor } from "@/components/admin/rich-text-editor";

/**
 * 富文本编辑器 —— 前台投稿上传通道(V4.8.1 修复)。
 *
 * 回归背景:V4.1.1「素材选择器统一入口」把 uploader 通道删掉,插图按钮一律拉起
 * 管理员素材库;前台用户点插图 → 打 /api/admin/media → 401 → 报错。
 * 这里锁住:传了 uploader 时**必须**走用户通道(本地选文件 + 调用 uploader),
 * 且**不得**请求管理员接口;不传 uploader(后台场景)时仍走素材库。
 */

let container: HTMLDivElement;
let root: Root;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // React 18+ 的 act 环境开关(happy-dom 下需显式开启,否则刷屏告警)
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  // 素材库接口形状:folders/items/total(后台通道用例会真正拉到这一步)
  fetchSpy = vi.fn(
    async () =>
      new Response(JSON.stringify({ ok: true, data: { folders: [], items: [], total: 0 } }), {
        status: 200,
      })
  );
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

/** 等待编辑器挂载(Tiptap 异步初始化) */
async function mount(ui: React.ReactElement) {
  await act(async () => {
    root.render(ui);
  });
  for (let i = 0; i < 20; i++) {
    if (container.querySelector(".tiptap")) break;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }
}

function findButton(title: string): HTMLButtonElement {
  const btn = Array.from(container.querySelectorAll("button")).find(
    (b) => b.getAttribute("title")?.startsWith(title)
  );
  if (!btn) throw new Error(`未找到按钮:${title}`);
  return btn as HTMLButtonElement;
}

describe("前台投稿:编辑器走用户上传通道", () => {
  it("传 uploader 时:插图不请求管理员接口,而是调用 uploader 并插入返回的 URL", async () => {
    const uploader = vi.fn(async () => ({ url: "/uploads/2026/09/ugc-pic.webp" }));
    const onChange = vi.fn();
    await mount(<RichTextEditor value="" onChange={onChange} uploader={uploader} />);

    // 点「插入图片」:应拉起本地文件选择,而不是打开素材库弹窗
    await act(async () => {
      findButton("插入图片").click();
    });
    expect(container.textContent).not.toContain("选择素材"); // 未打开素材库

    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    expect(input!.accept).toContain("image/");

    // 模拟选中一张图
    const file = new File(["x"], "pic.png", { type: "image/png" });
    Object.defineProperty(input!, "files", { value: [file], configurable: true });
    await act(async () => {
      input!.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(uploader).toHaveBeenCalledTimes(1);
    expect(uploader).toHaveBeenCalledWith(file);
    // 图片已进入正文
    expect(onChange).toHaveBeenCalled();
    expect(String(onChange.mock.calls.at(-1)?.[0])).toContain("/uploads/2026/09/ugc-pic.webp");
    // 关键:绝不碰管理员接口
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("/api/admin/"))).toBe(false);
  });

  it("uploader 抛错时给出中文提示,不静默失败", async () => {
    const uploader = vi.fn(async () => {
      throw new Error("图片文件无法识别或已损坏");
    });
    await mount(
      <>
        <RichTextEditor value="" onChange={() => {}} uploader={uploader} />
        <Toaster />
      </>
    );

    await act(async () => {
      findButton("插入图片").click();
    });
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", {
      value: [new File(["x"], "bad.txt", { type: "image/png" })],
      configurable: true,
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(uploader).toHaveBeenCalled();
    // 错误信息经 sonner toast 呈现(挂在 body 上)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(document.body.textContent).toContain("图片文件无法识别");
  });
});

describe("后台(未传 uploader):维持素材库通道", () => {
  it("插图按钮仍打开素材库,且页面不存在隐藏的本地 file input", async () => {
    await mount(<RichTextEditor value="" onChange={() => {}} />);
    expect(container.querySelector('input[type="file"]')).toBeNull();

    await act(async () => {
      findButton("插入图片").click();
    });
    // 素材库弹窗(Dialog)随即挂载
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(document.body.textContent).toContain("选择素材");
  });
});
