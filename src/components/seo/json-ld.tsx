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
  tagline,
  icp,
  contactAddress,
  sameAs,
}: {
  siteName: string;
  siteUrl: string;
  logoUrl: string;
  phone: string;
  email: string;
  seo: { city: string; address: string; lat: string; lng: string; serviceArea: string };
  /** 站点一句话定位(V4.7.3):AI 判断"你是谁、做什么"的最直接字段 */
  tagline?: string;
  /** ICP 备案号(V4.7.3):作为通用 identifier 暴露(schema.org 无 ICP 专用属性) */
  icp?: string;
  /** 经营地址(V4.7.3):地址的单一事实来源 = 品牌信息.contactAddress,与页脚一致 */
  contactAddress?: string;
  /** 外部主页(V4.7.3):公众号等,给 AI 提供实体锚点 */
  sameAs?: string[];
}) {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteName,
    url: siteUrl,
  };
  if (tagline) data.description = tagline;
  if (icp) {
    // 备案号:对 AI/搜索引擎而言是站点的官方登记标识;中文 name 便于理解取值含义
    data.identifier = { "@type": "PropertyValue", name: "ICP备案号", value: icp };
  }
  if (logoUrl) data.logo = new URL(logoUrl, siteUrl).toString();
  if (phone || email) {
    data.contactPoint = {
      "@type": "ContactPoint",
      ...(phone ? { telephone: phone } : {}),
      ...(email ? { email } : {}),
      contactType: "customer service",
    };
  }
  const street = contactAddress || seo.address; // V4.7.3:地址单一事实来源 = 品牌信息
  if (seo.city || street) {
    data.address = {
      "@type": "PostalAddress",
      ...(seo.city ? { addressLocality: seo.city } : {}),
      ...(street ? { streetAddress: street } : {}),
    };
  }
  if (seo.lat && seo.lng) {
    data.geo = { "@type": "GeoCoordinates", latitude: seo.lat, longitude: seo.lng };
  }
  if (seo.serviceArea) data.areaServed = seo.serviceArea;
  if (sameAs && sameAs.length > 0) data.sameAs = sameAs;
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
  keywords,
  license,
}: {
  locale: string;
  slug: string;
  title: string;
  description: string;
  cover: string | null;
  publishedAt: string;
  authorName?: string | null;
  /** 关键词标签(V4.7.0):写入结构化数据,利于 AI 引擎摘录与相关推荐 */
  keywords?: string[];
  /** 内容许可(V4.7.4):如 CC BY-NC 4.0,告诉 AI/转载者引用规则 */
  license?: string;
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
        ...(keywords && keywords.length > 0 ? { keywords: keywords.join(", ") } : {}),
        ...(license ? { license } : {}),
      }}
    />
  );
}

/**
 * 商品(moduleType=product 的详情页用,V3.0 REQ-004):
 * - image 相对路径用站点 URL 绝对化(与 ArticleJsonLd 同机制),支持图集数组
 * - brand 为品牌配置站点名;category 为商品栏目名
 * - specs 含 k 为「型号」的键值时输出 sku(展示型站点无 offers,警告已接受)
 */
export function ProductJsonLd({
  name,
  description,
  image,
  url,
  category,
  brand,
  specs,
  price,
}: {
  name: string;
  description: string;
  image: string | string[] | null;
  url: string;
  category?: string | null;
  brand?: string | null;
  specs?: { k: string; v: string }[] | null;
  /** V4.0:价格(整数分+币种);提供时输出 schema.org offers(Google 免费商品列表要求) */
  price?: { cents: number; currency: string } | null;
}) {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const absolutize = (u: string) => new URL(u, base).toString();
  // 单图输出单个绝对 URL(与 ArticleJsonLd 一致);图集数组逐项绝对化;空 → 省略字段
  const list = Array.isArray(image) ? image.filter(Boolean) : image ? [image] : [];
  const imageField =
    list.length === 0 ? null : Array.isArray(image) ? list.map(absolutize) : absolutize(list[0]);
  const model = specs?.find((s) => s.k?.trim() === "型号" && s.v?.trim());
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "Product",
        name,
        description,
        url,
        ...(imageField ? { image: imageField } : {}),
        ...(brand ? { brand: { "@type": "Brand", name: brand } } : {}),
        ...(category ? { category } : {}),
        ...(model ? { sku: model.v.trim() } : {}),
        ...(price && Number.isFinite(price.cents)
          ? {
              offers: {
                "@type": "Offer",
                price: (price.cents / 100).toFixed(2),
                priceCurrency: price.currency,
                availability: "https://schema.org/InStock",
                url,
              },
            }
          : {}),
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
