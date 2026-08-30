import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getWechatConfig } from "@/lib/config";
import { getSeoMetaFor } from "@/server/seo";
import { safeInternalPath } from "@/app/[locale]/(site)/account/logic";
import { LoginForm } from "@/components/site/auth-forms";

/** 登录页(需求 4.6):微信入口按后台配置动态显示 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    ...(await getSeoMetaFor("login", locale)),
    robots: { index: false, follow: true },
  };
}

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ redirect?: string | string[] }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  // ?redirect= 回跳支持(REQ-006):收藏等入口带 redirect 参数跳转登录页。
  // 归一化为既有 LoginForm 的 next 参数(仅放行站内路径,防开放重定向),
  // 原 ?next= 流程不受影响。
  const redirectParam = Array.isArray(sp.redirect) ? sp.redirect[0] : sp.redirect;
  const target = safeInternalPath(redirectParam);
  if (target) {
    redirect(`/${locale}/login?next=${encodeURIComponent(target)}`);
  }

  const wechat = await getWechatConfig();
  const wechatEnabled = wechat.enabled && !!wechat.appId && !!wechat.appSecret;

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <LoginForm wechatEnabled={wechatEnabled} />
    </main>
  );
}
