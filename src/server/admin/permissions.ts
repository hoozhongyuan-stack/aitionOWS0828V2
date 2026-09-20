/**
 * V4.1 后台权限:预定义权限组(用户确认的方案——非自由细粒度勾选)。
 * OWNER(主账号)全部权限;STAFF(子账号)按勾选组获得菜单与 API 访问。
 * 菜单可见性 = 权限;安全边界在 API 守卫(见 lib/auth/session requireOwner/requirePerm)。
 */

export type PermissionKey = "content" | "commerce" | "moderation" | "geo";

export const PERMISSION_GROUPS: { key: PermissionKey; label: string; desc: string; menus: string[] }[] = [
  {
    key: "content",
    label: "内容管理",
    desc: "内容、栏目、导航、轮播图、文件、表单",
    menus: ["/admin/content", "/admin/categories", "/admin/navigation", "/admin/banners", "/admin/media", "/admin/forms"],
  },
  { key: "commerce", label: "交易管理", desc: "订单查看与售后/状态操作(商店设置为 OWNER 专属)", menus: ["/admin/orders"] },
  { key: "moderation", label: "互动审核", desc: "评论与投稿审核", menus: ["/admin/ugc"] },
  { key: "geo", label: "GEO 监测", desc: "AI 爬虫与引荐数据查看", menus: ["/admin/geo-monitor", "/admin/geo-events"] },
];

/** OWNER 专属菜单(不可授权给子账号):站点配置/用户/子账号/日志/备份/安全/数据看板 */
export const OWNER_ONLY_MENUS: string[] = [
  "/admin/dashboard",
  "/admin/theme",
  "/admin/layout",
  "/admin/brand",
  "/admin/seo",
  "/admin/i18n",
  "/admin/settings",
  "/admin/shop",
  "/admin/users",
  "/admin/admin-users",
  "/admin/admin-logs",
  "/admin/backup",
  "/admin/security",
];

export const VALID_PERMISSION_KEYS: string[] = PERMISSION_GROUPS.map((g) => g.key);

/** 解析 permissions JSON 文本(容错:非法/空返回空数组) */
export function parsePermissions(raw: string | null | undefined): PermissionKey[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is PermissionKey => typeof v === "string" && VALID_PERMISSION_KEYS.includes(v));
  } catch {
    return [];
  }
}

export function serializePermissions(keys: string[]): string {
  return JSON.stringify(keys.filter((k): k is PermissionKey => VALID_PERMISSION_KEYS.includes(k)));
}

/**
 * 子账号登录后的落地页候选顺序(与侧边栏分组顺序一致:内容 → 获客 → 交易 → 互动 → GEO)。
 * 存在的意义:登录跳转不能再写死 /admin/dashboard —— 那是主账号专属页,
 * 子账号进去只会拿到 403「无权限执行此操作」(V4.8.1 修复的登录红条根因)。
 */
const STAFF_LANDING_ORDER: string[] = [
  "/admin/content",
  "/admin/categories",
  "/admin/navigation",
  "/admin/banners",
  "/admin/media",
  "/admin/forms",
  "/admin/orders",
  "/admin/ugc",
  "/admin/geo-monitor",
  "/admin/geo-events",
];

/**
 * 管理员登录后的落地页:
 * - OWNER → 数据看板(主账号专属);
 * - STAFF → 第一个有权限的菜单;一个权限都没勾时返回 null(由调用方渲染"待分配权限"空态)。
 */
export function resolveAdminLanding(role: string, permissions: PermissionKey[]): string | null {
  if (role !== "STAFF") return "/admin/dashboard";
  return STAFF_LANDING_ORDER.find((menu) => canSeeMenu(menu, role, permissions)) ?? null;
}

/** 菜单路径 → 是否可见(owner 全见;staff 按组;未知路径 owner only 兜底) */
export function canSeeMenu(path: string, role: string, permissions: PermissionKey[]): boolean {
  if (role !== "STAFF") return true;
  if (OWNER_ONLY_MENUS.some((m) => path.startsWith(m))) return false;
  return PERMISSION_GROUPS.some((g) => permissions.includes(g.key) && g.menus.some((m) => path.startsWith(m)));
}
