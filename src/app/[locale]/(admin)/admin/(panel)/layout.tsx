import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Toaster } from "sonner";
import { getGuardedAdmin } from "@/lib/auth/session";
import { getBrandConfig, getSecurityConfig } from "@/lib/config";
import { isInsecureSecret } from "@/lib/auth/jwt";
import { AdminSidebar } from "@/components/admin/sidebar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * 后台面板布局:统一管理员会话校验(JWT 真实验证,middleware 只做 cookie 存在性检查)。
 * 未登录 → 跳转后台登录页。
 */
/** 后台整组页面不对外索引 */
export async function generateMetadata(): Promise<Metadata> {
  return { robots: { index: false, follow: false } };
}

export default async function AdminPanelLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const admin = await getGuardedAdmin();
  if (!admin) redirect(`/${locale}/admin/login`);

  const [brand, security] = await Promise.all([getBrandConfig(), getSecurityConfig()]);

  return (
    <div className="flex min-h-screen bg-muted/30">
      <Toaster richColors position="top-center" />
      <AdminSidebar
        siteName={brand.siteName}
        adminRole={admin.role}
        adminPermissions={admin.permissions}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b bg-background px-6">
          <div className="text-sm text-muted-foreground">企业官网管理后台</div>
          <div className="text-sm">
            {admin.name}{" "}
            <span className="text-muted-foreground">
              {admin.role === "OWNER" ? "(主账号)" : "(子账号)"}
            </span>
          </div>
        </header>
        <main className="flex-1 space-y-4 p-6">
          {!security.defaultPwChanged && (
            <Alert variant="destructive">
              <AlertTitle>安全提醒</AlertTitle>
              <AlertDescription>
                当前仍在使用默认管理员密码,请立即前往「系统 → 安全」修改密码。
              </AlertDescription>
            </Alert>
          )}
          {isInsecureSecret() && (
            <Alert variant="destructive">
              <AlertTitle>部署提醒</AlertTitle>
              <AlertDescription>
                AUTH_SECRET 仍为默认值,生产环境请在部署配置中替换为强随机串并重启服务。
              </AlertDescription>
            </Alert>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
