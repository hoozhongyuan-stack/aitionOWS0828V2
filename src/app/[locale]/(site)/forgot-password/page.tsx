import { setRequestLocale } from "next-intl/server";
import { ForgotPasswordForm } from "@/components/site/password-forms";

/** 忘记密码:输入邮箱,发送重置链接邮件 */
export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <ForgotPasswordForm />
    </main>
  );
}
