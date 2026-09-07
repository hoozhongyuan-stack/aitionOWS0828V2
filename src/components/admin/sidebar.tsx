"use client";

import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import Link from "next/link";
import {
  LayoutDashboard,
  Radar,
  FileText,
  FolderTree,
  Navigation,
  ClipboardList,
  MessageSquareWarning,
  Users,
  Image as ImageIcon,
  Images,
  Palette,
  PanelsTopLeft,
  BadgeInfo,
  Search,
  Languages,
  Settings,
  DatabaseBackup,
  ShieldCheck,
  LogOut,
  ExternalLink,
  Store,
  ReceiptText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { apiPost } from "@/components/admin/api-client";

/**
 * 后台侧边导航。
 * 分组:概览 / 内容 / 获客 / 用户与互动 / 站点配置 / 系统。
 */

const NAV_GROUPS: { title: string; items: { href: string; label: string; icon: React.ElementType }[] }[] = [
  {
    title: "概览",
    items: [
      { href: "/admin/dashboard", label: "数据看板", icon: LayoutDashboard },
      { href: "/admin/geo-monitor", label: "GEO 监测", icon: Radar },
    ],
  },
  {
    title: "内容管理",
    items: [
      { href: "/admin/content", label: "内容", icon: FileText },
      { href: "/admin/categories", label: "栏目", icon: FolderTree },
      { href: "/admin/navigation", label: "导航", icon: Navigation },
      { href: "/admin/banners", label: "轮播图", icon: Images },
      { href: "/admin/media", label: "文件", icon: ImageIcon },
    ],
  },
  {
    title: "获客",
    items: [{ href: "/admin/forms", label: "表单", icon: ClipboardList }],
  },
  {
    title: "交易",
    items: [
      { href: "/admin/shop", label: "商店设置", icon: Store },
      { href: "/admin/orders", label: "订单管理", icon: ReceiptText },
    ],
  },
  {
    title: "用户与互动",
    items: [
      { href: "/admin/ugc", label: "互动审核", icon: MessageSquareWarning },
      { href: "/admin/users", label: "注册用户", icon: Users },
    ],
  },
  {
    title: "站点配置",
    items: [
      { href: "/admin/theme", label: "主题外观", icon: Palette },
      { href: "/admin/layout", label: "页面布局", icon: PanelsTopLeft },
      { href: "/admin/brand", label: "品牌信息", icon: BadgeInfo },
      { href: "/admin/seo", label: "SEO / GEO", icon: Search },
      { href: "/admin/i18n", label: "语言", icon: Languages },
      { href: "/admin/settings", label: "功能设置", icon: Settings },
    ],
  },
  {
    title: "系统",
    items: [
      { href: "/admin/backup", label: "备份", icon: DatabaseBackup },
      { href: "/admin/security", label: "安全", icon: ShieldCheck },
    ],
  },
];

export function AdminSidebar({ siteName }: { siteName: string }) {
  const pathname = usePathname();
  const locale = useLocale();
  const router = useRouter();

  async function logout() {
    try {
      await apiPost("/api/admin/auth/logout");
      router.replace(`/${locale}/admin/login`);
      router.refresh();
    } catch {
      toast.error("退出失败");
    }
  }

  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r bg-background">
      <div className="flex h-14 items-center gap-2 border-b px-4 font-semibold">
        {siteName}
        <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
          后台
        </span>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto p-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <div className="px-2 pb-1 text-xs font-medium text-muted-foreground">{group.title}</div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const href = `/${locale}${item.href}`;
                const active = pathname === href || pathname.startsWith(href + "/");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={href}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="space-y-1 border-t p-3">
        <a
          href={`/${locale}`}
          target="_blank"
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <ExternalLink className="h-4 w-4" />
          访问前台
        </a>
        <button
          onClick={logout}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
          退出登录
        </button>
      </div>
    </aside>
  );
}