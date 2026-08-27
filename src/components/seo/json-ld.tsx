/**
 * 结构化数据组件(需求 4.1):企业 / 文章 / 面包屑 JSON-LD,适配 AI 智能展示。
 * 全部服务端渲染,直接进 HTML 源码。
 */

function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

/** 企业组织(含 GEO 地理信息),放全站布局 */
export function OrganizationJsonLd({
  siteName,
  siteUrl,
  logoUrl,
  phone,
  email,
  seo,
}: {
  siteName: string;
  siteUrl: string;
  logoUrl: string;
  phone: string;
  email: string;
  seo: { city: string; address: string; lat: string; lng: string; serviceArea: string };
}) {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteName,
    url: siteUrl,
  };
  if (logoUrl) data.logo = new URL(logoUrl, siteUrl).toString();
  if (phone || email) {
    data.contactPoint = {
      "@type": "ContactPoint",
      ...(phone ? { telephone: phone } : {}),
      ...(email ? { email } : {}),
      contactType: "customer service",
    };
  }
  if (seo.city || seo.address) {
    data.address = {
      "@type": "PostalAddress",
      ...(seo.city ? { addressLocality: seo.city } : {}),
      ...(seo.address ? { streetAddress: seo.address } : {}),
    };
  }
  if (seo.lat && seo.lng) {
    data.geo = { "@type": "GeoCoordinates", latitude: seo.lat, longitude: seo.lng };
  }
  if (seo.serviceArea) data.areaServed = seo.serviceArea;
  return <JsonLd data={data} />;
}

/** 文章(详情页) */
export function ArticleJsonLd({
  locale,
  slug,
  title,
  description,
  cover,
  publishedAt,
  authorName,
}: {
  locale: string;
  slug: string;
  title: string;
  description: string;
  cover: string | null;
  publishedAt: string;
  authorName?: string | null;
}) {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "Article",
        headline: title,
        description,
        inLanguage: locale,
        datePublished: publishedAt,
        mainEntityOfPage: `${base}/${locale}/article/${slug}`,
        ...(cover ? { image: new URL(cover, base).toString() } : {}),
        // 作者(新增需求①):写入结构化数据,利于搜索引擎与 AI 检索展示署名
        ...(authorName ? { author: { "@type": "Person", name: authorName } } : {}),
      }}
    />
  );
}

/** 产品(moduleType=product 的详情页可用) */
export function ProductJsonLd({
  name,
  description,
  image,
  url,
}: {
  name: string;
  description: string;
  image: string | null;
  url: string;
}) {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "Product",
        name,
        description,
        url,
        ...(image ? { image } : {}),
      }}
    />
  );
}

/** 面包屑 */
export function BreadcrumbJsonLd({ items }: { items: { name: string; url: string }[] }) {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((it, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: it.name,
          item: it.url,
        })),
      }}
    />
  );
}
