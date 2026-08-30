/**
 * 个人中心 / 收藏前端交互的纯逻辑(可被 vitest node 环境直接导入测试)。
 *
 * 环境约定:本仓库 tsconfig 为 jsx=preserve,vitest(node)无法导入任何 .tsx 模块,
 * 因此交互状态机、URL 构造等纯函数一律收敛在本 .ts 文件,
 * interaction-bar / account 页面 / login 页面等从这里导入。
 */

/** 收藏按钮 UI 状态(乐观更新状态机的载体) */
export interface FavoriteUiState {
  favorited: boolean;
  favoriteCount: number;
}

/**
 * 未登录点击收藏 → 登录跳转 URL(AC-007:登录后回原详情页)。
 * 回跳参数用 redirect 携带当前路径;登录页会将其归一化为既有 LoginForm 的 next 参数。
 */
export function buildLoginRedirectUrl(locale: string, currentPath: string): string {
  return `/${locale}/login?redirect=${encodeURIComponent(currentPath)}`;
}

/**
 * 开放重定向防护:仅放行站内绝对路径(以单个 / 开头)。
 * 拒绝 //evil.example(协议相对)、https:// 外链、javascript: 等任意非站内值。
 * L-4:校验前先把 \ 归一化为 / —— 部分客户端/服务端会把 \ 当路径分隔符,
 * "/\evil.example" 这类输入可绕过 "//" 前缀检查变成协议相对地址;归一化后统一判定。
 */
export function safeInternalPath(value: string | null | undefined): string {
  if (!value) return "";
  const normalized = value.replace(/\\/g, "/");
  if (!normalized.startsWith("/") || normalized.startsWith("//")) return "";
  return normalized;
}

/**
 * 收藏按钮乐观更新状态机:一次应用 = 一次状态翻转。
 * 请求失败时恢复操作前快照即回滚(连续应用两次回到原状态)。
 * 计数地板为 0,不出现负数。
 */
export function applyFavoriteOptimism(state: FavoriteUiState): FavoriteUiState {
  return {
    favorited: !state.favorited,
    favoriteCount: state.favorited
      ? Math.max(0, state.favoriteCount - 1)
      : state.favoriteCount + 1,
  };
}

export type AccountTab = "favorites" | "submissions";

/** 个人中心 Tab 解析(Next searchParams):仅 "submissions" 进投稿视图,其余一律收藏 */
export function parseAccountTab(raw: string | string[] | undefined): AccountTab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "submissions" ? "submissions" : "favorites";
}

/** 旧入口 /submissions 的兼容跳转目标(REQ-008 / AC-009) */
export function submissionsRedirectPath(locale: string): string {
  return `/${locale}/account?tab=submissions`;
}

/** 收藏条目类型(moduleType → 商品/文章,用于类型标签与详情路由分流) */
export function favoriteKind(moduleType: string): "product" | "article" {
  return moduleType === "product" ? "product" : "article";
}
