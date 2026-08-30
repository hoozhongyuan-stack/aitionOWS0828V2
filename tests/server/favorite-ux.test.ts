import { describe, expect, it } from "vitest";

/**
 * TASK-008 前端交互纯逻辑单元测试(AC-007 收藏登录墙回跳 + AC-008 个人中心),
 * 补齐 TEST-009 中「回跳参数构造」的前端部分与收藏按钮乐观更新/回滚状态机。
 *
 * 约定:交互逻辑抽取为可导入的纯函数(不依赖 DOM/请求作用域);
 * 组件渲染不作断言(归 MANUAL-003/004 走查)。
 * RED 约定:函数尚未实现时以断言失败(missing_behavior)暴露,而非模块解析错误。
 */

type AccountLogic = typeof import("@/app/[locale]/(site)/account/logic");

/**
 * 环境约定:vitest 环境为 node 且本仓库 tsconfig jsx=preserve,tsx 模块不可被
 * 测试导入 —— 因此全部交互纯逻辑(含乐观更新状态机)收敛在 account/logic.ts
 * (.ts 纯模块),interaction-bar 等客户端组件从该模块导入使用。
 */

/** RED 阶段模块尚不存在:捕获后由「函数存在性断言」给出 missing_behavior 失败 */
async function loadLogic(): Promise<Partial<AccountLogic>> {
  try {
    return (await import("@/app/[locale]/(site)/account/logic")) as Partial<AccountLogic>;
  } catch {
    return {};
  }
}

interface FavUiState {
  favorited: boolean;
  favoriteCount: number;
}

function expectExport(mod: unknown, name: string, hint: string): void {
  expect(typeof (mod as Record<string, unknown>)?.[name], `missing_behavior:${hint}`).toBe(
    "function"
  );
}

describe("AC-007:未登录点击收藏 → 登录跳转 URL 构造(登录后回原详情页)", () => {
  it("buildLoginRedirectUrl 产出 /{locale}/login?redirect=<编码后的当前路径>", async () => {
    const mod = (await loadLogic()) as Partial<AccountLogic>;
    expectExport(mod, "buildLoginRedirectUrl", "buildLoginRedirectUrl 尚未实现(account/logic)");
    const url = mod.buildLoginRedirectUrl!("zh-CN", "/zh-CN/article/hello-world");
    expect(url.startsWith("/zh-CN/login?redirect=")).toBe(true);
    expect(new URL(`https://site.test${url}`).searchParams.get("redirect")).toBe(
      "/zh-CN/article/hello-world"
    );
  });

  it("en 场景与含查询串的路径原样保留(编码后可解码还原)", async () => {
    const mod = (await loadLogic()) as Partial<AccountLogic>;
    const url = mod.buildLoginRedirectUrl!("en", "/en/product/ax-100?spec=1");
    expect(url.startsWith("/en/login?redirect=")).toBe(true);
    expect(new URL(`https://site.test${url}`).searchParams.get("redirect")).toBe(
      "/en/product/ax-100?spec=1"
    );
  });

  it("safeInternalPath 拒绝外链/协议相对路径,放行站内绝对路径(登录后回跳防开放重定向)", async () => {
    const mod = (await loadLogic()) as Partial<AccountLogic>;
    expectExport(mod, "safeInternalPath", "safeInternalPath 尚未实现(account/logic)");
    expect(mod.safeInternalPath!("/zh-CN/article/a")).toBe("/zh-CN/article/a");
    expect(mod.safeInternalPath!("//evil.example/x")).toBe("");
    expect(mod.safeInternalPath!("https://evil.example/x")).toBe("");
    expect(mod.safeInternalPath!("javascript:alert(1)")).toBe("");
    expect(mod.safeInternalPath!("")).toBe("");
    expect(mod.safeInternalPath!(null)).toBe("");
    expect(mod.safeInternalPath!(undefined)).toBe("");
  });
});

describe("AC-007:收藏按钮乐观更新与失败回滚状态机", () => {
  async function loadOptimism(): Promise<(s: FavUiState) => FavUiState> {
    const mod = (await loadLogic()) as Partial<AccountLogic>;
    expectExport(mod, "applyFavoriteOptimism", "applyFavoriteOptimism 尚未实现(account/logic)");
    return mod.applyFavoriteOptimism as (s: FavUiState) => FavUiState;
  }

  it("未收藏 → 乐观置为已收藏且计数 +1", async () => {
    const next = (await loadOptimism())({ favorited: false, favoriteCount: 3 });
    expect(next).toEqual({ favorited: true, favoriteCount: 4 });
  });

  it("已收藏 → 乐观置为未收藏且计数 -1;计数为 0 时地板为 0 不出现负数", async () => {
    const step = await loadOptimism();
    expect(step({ favorited: true, favoriteCount: 3 })).toEqual({
      favorited: false,
      favoriteCount: 2,
    });
    expect(step({ favorited: true, favoriteCount: 0 })).toEqual({
      favorited: false,
      favoriteCount: 0,
    });
  });

  it("连续两次应用回到原状态(请求失败时恢复操作前快照即回滚)", async () => {
    const step = await loadOptimism();
    const snapshot: FavUiState = { favorited: false, favoriteCount: 7 };
    expect(step(step(snapshot))).toEqual(snapshot);
  });
});

describe("AC-008:个人中心 Tab 解析(searchParams 切换,默认收藏)", () => {
  it("缺省/空 → favorites;submissions → submissions;非法值回退 favorites", async () => {
    const mod = (await loadLogic()) as Partial<AccountLogic>;
    expectExport(mod, "parseAccountTab", "parseAccountTab 尚未实现(account/logic)");
    expect(mod.parseAccountTab!(undefined)).toBe("favorites");
    expect(mod.parseAccountTab!("")).toBe("favorites");
    expect(mod.parseAccountTab!("submissions")).toBe("submissions");
    expect(mod.parseAccountTab!("favorites")).toBe("favorites");
    expect(mod.parseAccountTab!("hacker-tab")).toBe("favorites");
  });
});
