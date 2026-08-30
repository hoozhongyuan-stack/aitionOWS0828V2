import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { submissionsRedirectPath } from "@/app/[locale]/(site)/account/logic";

export const metadata = {
  // 工具页无索引价值:noindex 防薄内容/重复内容(SEO 标准做法)
  robots: { index: false, follow: true },
};

/**
 * 旧入口兼容跳转(REQ-008 / AC-009):
 * 访问 /[locale]/submissions 一律 3xx 重定向到个人中心投稿视图
 * /[locale]/account?tab=submissions,保证既有链接不失效;
 * 登录墙与视图渲染统一由 /account 承担。
 */
export default async function SubmissionsRedirectPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  redirect(submissionsRedirectPath(locale));
}
