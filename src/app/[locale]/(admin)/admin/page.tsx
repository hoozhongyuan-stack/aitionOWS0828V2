import { redirect } from "next/navigation";
import { getGuardedAdmin } from "@/lib/auth/session";
import { resolveAdminLanding } from "@/server/admin/permissions";

export const metadata = { robots: { index: false, follow: false } };

/**
 * /admin 入口(V4.8.1 修复):按角色与权限决定落地页。
 * 此前写死跳 /admin/dashboard —— 该页仅主账号可见,子账号登录后会立刻吃到
 * 403「无权限执行此操作」并被弹红条(功能不受影响,但第一印象很差)。
 * 现在:OWNER → 数据看板;STAFF → 第一个有权限的菜单;无任何权限 → 空态提示。
 */
export default async function AdminIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const admin = await getGuardedAdmin();
  if (!admin) redirect(`/${locale}/admin/login`);

  const landing = resolveAdminLanding(admin.role, admin.permissions);
  if (landing) redirect(`/${locale}${landing}`);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4" data-admin>
      <div className="max-w-md rounded-xl border bg-background p-8 text-center">
        <h1 className="text-lg font-semibold">尚未分配后台权限</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          当前子账号没有勾选任何权限组,请联系主账号在「子账号」里分配后再登录。
        </p>
      </div>
    </main>
  );
}
