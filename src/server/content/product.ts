import { prisma } from "@/lib/db";
import { CONTENT_STATUS } from "@/types/domain";
import { parseFormFields } from "@/types/form";
import { promoteScheduled } from "./index";
import { resolveDisplayCounts } from "@/server/stats";

/**
 * 商品域(需求 V3.0 REQ-001/002,独立可测量模块——NFR-005 覆盖率口径)。
 * 从 src/server/content/index.ts 拆出;index.ts 经 re-export 保持既有导入路径不变。
 * 注:promoteScheduled(懒惰定时晋升)留在 index.ts,此处经 ESM 活绑定引用(函数声明,无循环初始化问题)。
 */

/** 商品图集项 */
export interface ProductGalleryImage {
  url: string;
}

/** 商品规格参数行(有序键值对) */
export interface ProductSpec {
  k: string;
  v: string;
}

/**
 * 解析图集 JSON。返回 urls 与 invalid 标记:
 * - 缺失(raw 为空)或为合法空数组 → 视为「未上传图集」,详情层可用封面图兜底
 * - 非法 JSON / 结构不对 → invalid=true,按空图集返回(AC-021),不做封面兜底
 */
export function parseGallery(raw: string | null | undefined): { invalid: boolean; urls: string[] } {
  if (!raw) return { invalid: false, urls: [] };
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { invalid: true, urls: [] };
    return {
      invalid: false,
      urls: parsed.filter((x): x is string => typeof x === "string" && x.trim() !== ""),
    };
  } catch {
    return { invalid: true, urls: [] };
  }
}

/** 解析规格参数 JSON(非法/缺失/结构不对一律容错为 [],不抛错) */
export function parseSpecs(raw: string | null | undefined): ProductSpec[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x): x is ProductSpec =>
          !!x &&
          typeof x === "object" &&
          typeof x.k === "string" &&
          typeof x.v === "string"
      )
      .map((x) => ({ k: x.k, v: x.v }));
  } catch {
    return [];
  }
}

/**
 * 详情链接按栏目模块类型分流(product 栏目走商品详情,其余沿用文章详情)。
 * 列表卡片/JSON-LD/sitemap 等需要详情链接的场景统一经此函数,保证 /article/ 存量行为不变。
 */
export function resolveContentDetailPath(
  moduleType: string,
  slug: string,
  locale: string
): string {
  return moduleType === "product"
    ? `/${locale}/product/${slug}`
    : `/${locale}/article/${slug}`;
}

/**
 * 商品详情数据组装(仅已发布可见,语义与文章详情一致):
 * - gallery 解析为 {url} 数组;缺失/非法容错为 [],封面图兜底插到首位
 * - specs 按兜底链解析为 {k,v} 数组(当前语言 translation.specs → Content.specs);缺失/非法容错为 []
 * - inquiryForm:formId 关联且表单 enabled===true 才返回表单数据,否则 null
 *   (与文章详情「渲染关联表单不校验 enabled」为有意差异,见 REQ-002)
 * - 单页 TDK 沿用 ContentTranslation(seoTitle/seoKeywords/seoDesc)
 */
export async function getProductDetail(
  slug: string,
  locale: string,
  opts?: { allowUnpublished?: boolean }
) {
  await promoteScheduled();
  const content = await prisma.content.findUnique({
    where: { slug },
    include: { translations: true, category: { include: { translations: true } } },
  });
  if (!content) return null;
  // V4.3.0 前台预览：放行未发布内容——调用方必须先完成管理员鉴权（见商品详情页）
  if (content.status !== CONTENT_STATUS.PUBLISHED && !opts?.allowUnpublished) return null;

  const t = content.translations.find((x) => x.locale === locale) ?? content.translations[0];
  if (!t) return null;

  // 图集:缺失/空数组时用封面图兜底(插到首位);非法 JSON 按空图集返回(AC-021),不兜底
  const parsedGallery = parseGallery(content.gallery);
  const imageUrls =
    !parsedGallery.invalid && parsedGallery.urls.length === 0 && content.coverUrl
      ? [content.coverUrl]
      : parsedGallery.urls;
  const gallery: ProductGalleryImage[] = imageUrls.map((url) => ({ url }));

  // 询盘表单:仅「启用中」的关联表单才返回数据
  let inquiryForm: { id: number; slug: string; name: string; fields: ReturnType<typeof parseFormFields> } | null = null;
  if (content.formId) {
    const form = await prisma.form.findUnique({ where: { id: content.formId } });
    if (form && form.enabled) {
      inquiryForm = {
        id: form.id,
        slug: form.slug,
        name: form.name,
        fields: parseFormFields(form.schema),
      };
    }
  }

  // 拟真展示值(V4.8.0):与文章详情/列表卡片同源
  const display = (
    await resolveDisplayCounts([
      {
        id: content.id,
        publishedAt: content.publishAt ?? content.createdAt,
        viewCount: content.viewCount,
        likeCount: content.likeCount,
        shareCount: content.shareCount,
        favoriteCount: content.favoriteCount,
        statsMode: content.statsMode,
        statsBase: content.statsBase,
        statsSalt: content.statsSalt,
        status: content.status,
      },
    ])
  ).get(content.id);

  return {
    id: content.id,
    slug: content.slug,
    // 封面(V4.8.4):该语言翻译行专属封面优先,回退主表默认/中文封面;
    // og 兜底链 gallery[0] → 此处 coverUrl 随解析值。图集 gallery 本身跨语言,不解析
    coverUrl: t.coverUrl || content.coverUrl,
    formId: content.formId,
    authorName: content.authorName,
    favoriteCount: display?.favorites ?? content.favoriteCount,
    viewCount: display?.views ?? content.viewCount,
    priceCents: content.priceCents,
    currency: content.currency,
    likeCount: display?.likes ?? content.likeCount,
    shareCount: display?.shares ?? content.shareCount,
    publishedAt: content.publishAt ?? content.createdAt,
    category: {
      slug: content.category.slug,
      moduleType: content.category.moduleType,
      name:
        content.category.translations.find((x) => x.locale === locale)?.name ??
        content.category.translations[0]?.name ??
        content.category.slug,
    },
    title: t.title,
    summary: t.summary,
    body: t.body,
    seoTitle: t.seoTitle,
    seoKeywords: t.seoKeywords,
    seoDesc: t.seoDesc,
    availableLocales: content.translations.map((x) => x.locale),
    gallery,
    // specs 兜底链(V3.1 REQ-001):当前语言 translation.specs → Content.specs(主表兜底列)→ 空表;
    // 两者都可能为 JSON 串,非法/缺失沿 parseSpecs 容错为 []
    specs: parseSpecs(t.specs ?? content.specs),
    inquiryForm,
  };
}
