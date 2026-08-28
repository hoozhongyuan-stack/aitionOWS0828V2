import { setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { getSeoMetaFor } from "@/server/seo";
import { RegisterForm } from "@/components/site/auth-forms";

/** 注册页(需求 4.6):强制勾选协议 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    ...(await getSeoMetaFor("register", locale)),
    robots: { index: false, follow: true },
  };
}

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <RegisterForm />
    </main>
  );
}
