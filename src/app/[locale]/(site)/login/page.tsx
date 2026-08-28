import { setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { getWechatConfig } from "@/lib/config";
import { getSeoMetaFor } from "@/server/seo";
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
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const wechat = await getWechatConfig();
  const wechatEnabled = wechat.enabled && !!wechat.appId && !!wechat.appSecret;

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <LoginForm wechatEnabled={wechatEnabled} />
    </main>
  );
}
