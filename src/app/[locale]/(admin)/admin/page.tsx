import { redirect } from "next/navigation";

export const metadata = { robots: { index: false, follow: false } };

/** /admin 入口:统一跳转到数据看板 */
export default async function AdminIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/admin/dashboard`);
}
