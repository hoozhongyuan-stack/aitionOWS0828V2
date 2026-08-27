import { setRequestLocale } from "next-intl/server";
import { ResetPasswordForm } from "@/components/site/password-forms";

/** 重置密码:从邮件链接携带 token 进入,设置新密码 */
export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <ResetPasswordForm />
    </main>
  );
}
