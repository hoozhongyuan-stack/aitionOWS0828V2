import { describe, expect, it, vi } from "vitest";

/**
 * TEST-011(REQ-008 / AC-009):访问 /[locale]/submissions 必须 3xx 重定向到
 * 个人中心投稿视图 /[locale]/account?tab=submissions,保证既有入口不失效。
 *
 * App Router 的 redirect() 通过抛出 NEXT_REDIRECT 错误实现;
 * 此处 vi.mock next/navigation 捕获 redirect 调用参数并模拟同样的抛出行为,
 * 断言页面组件以目标 URL 调用了 redirect。
 *
 * RED 约定:失败必须是行为缺失(missing_behavior:仍指向旧登录页/旧内容页),
 * 而非模块解析或编译错误。
 */

const nav = vi.hoisted(() => ({
  redirect: vi.fn((url: string): never => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: nav.redirect,
}));

const intl = vi.hoisted(() => ({
  setRequestLocale: vi.fn(),
  getTranslations: vi.fn(async () => (key: string) => key),
}));

vi.mock("next-intl/server", () => ({
  setRequestLocale: intl.setRequestLocale,
  getTranslations: intl.getTranslations,
}));

// 会话读取在无请求作用域的 node 测试环境中不可用;未登录态(重定向与登录态无关)
vi.mock("@/lib/auth/session", () => ({
  getUserSession: vi.fn(async () => null),
}));

const { default: SubmissionsPage } = await import("@/app/[locale]/(site)/submissions/page");

function runPage(locale: string): Promise<unknown> {
  return SubmissionsPage({ params: Promise.resolve({ locale }) });
}

describe("TEST-011:/submissions 兼容跳转到个人中心投稿视图(AC-009)", () => {
  it("zh-CN 访问触发 redirect(/zh-CN/account?tab=submissions)", async () => {
    await expect(runPage("zh-CN")).rejects.toThrow("NEXT_REDIRECT");
    expect(nav.redirect).toHaveBeenCalledWith("/zh-CN/account?tab=submissions");
  });

  it("en 访问触发 redirect(/en/account?tab=submissions)", async () => {
    await expect(runPage("en")).rejects.toThrow("NEXT_REDIRECT");
    expect(nav.redirect).toHaveBeenCalledWith("/en/account?tab=submissions");
  });

  it("重定向目标是站内相对路径(非外链/非登录页)", async () => {
    const last = nav.redirect.mock.calls.at(-1)?.[0] as string;
    expect(last.startsWith("/")).toBe(true);
    expect(last).not.toContain("/login");
    expect(last).toContain("tab=submissions");
  });
});
