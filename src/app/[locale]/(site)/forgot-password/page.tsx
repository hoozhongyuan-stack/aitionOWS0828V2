import { setRequestLocale } from "next-intl/server";

export const metadata = {
  // 工具页无索引价值:noindex 防薄内容/重复内容(SEO 标准做法)
  robots: { index: false, follow: true },
};
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
