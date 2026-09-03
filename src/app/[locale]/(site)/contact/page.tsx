import { setRequestLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { getBrandConfig } from "@/lib/config";
import { getFormByRelatedKey } from "@/server/form";
import { getSeoMetaFor } from "@/server/seo";
import { buildOpenGraph, resolveMetadataTitle } from "@/lib/seo/open-graph";
import { FormRenderer } from "@/components/site/form-renderer";
import { Phone, Mail, MapPin } from "lucide-react";

/** 联系页:品牌联系方式 + 关联标识为 contact 的获客表单(需求 4.5);OG 见 generateMetadata(REQ-003) */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const meta = await getSeoMetaFor("contact", locale);
  const brand = await getBrandConfig();
  return {
    ...meta,
    // 分享 OG(V3.1 REQ-003):TDK 与 SeoMeta(contact) 同源;无内容封面,图兜底 LOGO
    openGraph: await buildOpenGraph({
      title: resolveMetadataTitle(meta.title, brand.siteName),
      description: meta.description,
      imagePath: null,
      locale,
    }),
  };
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [brand, form, t] = await Promise.all([
    getBrandConfig(),
    getFormByRelatedKey("contact"),
    getTranslations("site"),
  ]);

  return (
    <main className="container max-w-4xl py-12">
      <h1 className="mb-8 font-heading text-3xl font-bold">{t("heroCta")}</h1>
      <div className="grid gap-8 md:grid-cols-[1fr_1.2fr]">
        <div className="space-y-4 text-sm">
          {brand.contactPhone && (
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-primary" />
              <a href={`tel:${brand.contactPhone}`} className="hover:text-primary">
                {brand.contactPhone}
              </a>
            </div>
          )}
          {brand.contactEmail && (
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-primary" />
              <a href={`mailto:${brand.contactEmail}`} className="hover:text-primary">
                {brand.contactEmail}
              </a>
            </div>
          )}
          {brand.contactAddress && (
            <div className="flex items-center gap-3">
              <MapPin className="h-4 w-4 text-primary" />
              <span>{brand.contactAddress}</span>
            </div>
          )}
        </div>
        <div>
          {form ? (
            <FormRenderer slug={form.slug} title={form.name} fields={form.fields} />
          ) : (
            <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              管理员尚未配置联系表单(后台「表单管理」新建表单并将关联标识设为 contact)
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
