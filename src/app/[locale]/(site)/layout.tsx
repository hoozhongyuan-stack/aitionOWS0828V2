import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Toaster } from "sonner";
import { getBrandConfig, getSeoConfig, getFeatureFlags, getThemeConfig } from "@/lib/config";
import { getEnabledLocales } from "@/server/i18n";
import { getVisibleNav } from "@/server/content/nav";
import { getUserSession } from "@/lib/auth/session";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { OrganizationJsonLd } from "@/components/seo/json-ld";
import { PageTracker } from "@/components/site/page-tracker";

/**
 * 前台布局:页头 + 内容 + 页脚。
 * - 禁用语言访问 → 404
 * - 导航/品牌/语言全部来自后台配置(即时生效)
 */
export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const enabledLocales = await getEnabledLocales();
  // 语言被后台停用 → 前台 404(默认语言兜底允许,避免站点整体不可达)
  if (enabledLocales.length > 0 && !enabledLocales.some((l) => l.code === locale)) {
    notFound();
  }

  const [brand, seo, features, theme, nav, user, tAuth, tFooter, tSubmission] = await Promise.all([
    getBrandConfig(),
    getSeoConfig(),
    getFeatureFlags(),
    getThemeConfig(),
    getVisibleNav(locale),
    getUserSession(),
    getTranslations("auth"),
    getTranslations("footer"),
    getTranslations("submission"),
  ]);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return (
    <div className="flex min-h-screen flex-col">
      <Toaster richColors position="top-center" />
      <PageTracker />
      <OrganizationJsonLd
        siteName={brand.siteName}
        siteUrl={siteUrl}
        logoUrl={brand.logoUrl}
        phone={brand.contactPhone}
        email={brand.contactEmail}
        seo={seo}
      />
      <SiteHeader
        siteName={brand.siteName}
        logoUrl={brand.logoUrl}
        nav={nav}
        locales={enabledLocales.map((l) => ({ code: l.code, name: l.name }))}
        currentLocale={locale}
        user={user ? { name: user.name } : null}
        loginLabel={tAuth("login")}
        logoutLabel={tAuth("logout")}
        showSubmissions={features.submission}
        mySubmissionsLabel={tSubmission("myList")}
        logoHeight={theme.logoHeight}
        navFontSize={theme.navFontSize}
        navBold={theme.navBold}
      />
      <div className="flex-1">{children}</div>
      <SiteFooter
        brand={brand}
        locale={locale}
        labels={{
          register: tFooter("agreementRegister"),
          privacy: tFooter("agreementPrivacy"),
          contact: tFooter("contact"),
        }}
      />
    </div>
  );
}
