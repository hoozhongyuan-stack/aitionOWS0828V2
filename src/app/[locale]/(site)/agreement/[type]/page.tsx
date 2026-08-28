import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { AGREEMENT_TYPE } from "@/types/domain";
import { getAgreementForLocale } from "@/server/agreement";
import { buildAlternates } from "@/lib/seo/alternates";
import { sanitizeRichHtml } from "@/lib/sanitize";

/**
 * 协议展示页:/agreement/register | /agreement/privacy
 * 内容来自后台「语言管理 → 用户协议」,实时同步(需求 4.6)。
 */

const TYPE_MAP: Record<string, string> = {
  register: AGREEMENT_TYPE.REGISTER,
  privacy: AGREEMENT_TYPE.PRIVACY,
};

async function loadAgreement(locale: string, typeKey: string) {
  const type = TYPE_MAP[typeKey];
  if (!type) return null;
  return getAgreementForLocale(locale, type);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; type: string }>;
}): Promise<Metadata> {
  const { locale, type } = await params;
  const row = await loadAgreement(locale, type);
  return {
    title: row?.title ?? "协议",
    alternates: await buildAlternates(`/agreement/${type}`, locale),
  };
}

export default async function AgreementPage({
  params,
}: {
  params: Promise<{ locale: string; type: string }>;
}) {
  const { locale, type } = await params;
  setRequestLocale(locale);
  if (!TYPE_MAP[type]) notFound();

  const row = await loadAgreement(locale, type);

  return (
    <main className="container max-w-3xl py-10">
      <h1 className="mb-6 text-2xl font-semibold">{row?.title ?? "协议内容暂未配置"}</h1>
      {row?.body ? (
        <article
          className="rich-content"
          dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(row.body) }}
        />
      ) : (
        <p className="text-muted-foreground">管理员尚未发布该协议内容。</p>
      )}
    </main>
  );
}
