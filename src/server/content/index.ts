import { prisma } from "@/lib/db";
import { CONTENT_STATUS, CONTENT_SOURCE, TARGET_TYPE, type ContentStatus } from "@/types/domain";
import { invalidateNavCache } from "./nav";
import { parseSpecs, type ProductSpec } from "./product";

/**
 * CMS 内容服务(需求 4.4):栏目 / 导航 / 内容 全量读写。
 * 定时发布策略:懒惰晋升 —— 任何读路径先把到点的 SCHEDULED 晋升为 PUBLISHED,
 * 无需常驻定时器,SSR 语义下用户可见性与到点时间一致。
 *
 * 商品域(V3.0 REQ-001/002)已拆分至 ./product,llms.txt 组装已拆分至 ./llms
 * (独立可测量模块,NFR-005 覆盖率口径);此处显式 re-export 保持既有导入路径不变。
 */
export {
  resolveContentDetailPath,
  getProductDetail,
  parseGallery,
  parseSpecs,
} from "./product";
export type { ProductGalleryImage, ProductSpec } from "./product";

// ---------------- 定时发布 ----------------

/** 把到点的定时内容晋升为已发布(幂等,读路径调用) */
export async function promoteScheduled(): Promise<void> {
  await prisma.content.updateMany({
    where: { status: CONTENT_STATUS.SCHEDULED, publishAt: { lte: new Date() } },
    data: { status: CONTENT_STATUS.PUBLISHED },
  });
}

// ---------------- 栏目 ----------------

export interface CategoryInput {
  id?: number;
  slug: string;
  parentId: number | null;
  moduleType: string;
  sort: number;
  visible: boolean;
  externalUrl: string | null;
  allowSubmit: boolean;
  translations: { locale: string; name: string; description?: string | null }[];
}

/** 后台栏目列表(含翻译与内容计数) */
export async function listCategories() {
  return prisma.category.findMany({
    orderBy: [{ sort: "asc" }, { id: "asc" }],
    include: { translations: true, _count: { select: { contents: true, children: true } } },
  });
}

/** 新建/更新栏目(翻译整组覆盖) */
export async function saveCategory(input: CategoryInput) {
  if (input.id && input.parentId === input.id) throw new Error("父栏目不能是自身");
  const data = {
    slug: input.slug,
    parentId: input.parentId,
    moduleType: input.moduleType,
    sort: input.sort,
    visible: input.visible,
    externalUrl: input.externalUrl || null,
    allowSubmit: input.allowSubmit,
  };
  const category = input.id
    ? await prisma.category.update({ where: { id: input.id }, data })
    : await prisma.category.create({ data });

  await prisma.categoryTranslation.deleteMany({ where: { categoryId: category.id } });
  for (const t of input.translations.filter((t) => t.name.trim())) {
    await prisma.categoryTranslation.create({
      data: {
        categoryId: category.id,
        locale: t.locale,
        name: t.name,
        description: t.description ?? null,
      },
    });
  }
  await invalidateNavCache();
  return category;
}

/** 删除栏目(有子栏目或内容时拒绝,防误删) */
export async function deleteCategory(id: number) {
  const [children, contents] = await Promise.all([
    prisma.category.count({ where: { parentId: id } }),
    prisma.content.count({ where: { categoryId: id } }),
  ]);
  if (children > 0) throw new Error("该栏目存在子栏目,请先处理子栏目");
  if (contents > 0) throw new Error(`该栏目下还有 ${contents} 篇内容,请先迁移或删除内容`);
  await prisma.category.delete({ where: { id } });
  await invalidateNavCache();
}

/** 允许投稿的栏目(前台投稿页选项) */
export async function listSubmittableCategories(locale: string) {
  const cats = await prisma.category.findMany({
    where: { allowSubmit: true, visible: true },
    include: { translations: true },
    orderBy: { sort: "asc" },
  });
  return cats.map((c) => ({
    id: c.id,
    slug: c.slug,
    name:
      c.translations.find((t) => t.locale === locale)?.name ?? c.translations[0]?.name ?? c.slug,
  }));
}

// ---------------- 导航 ----------------

export interface NavItemInput {
  id?: number;
  parentId: number | null;
  categoryId: number | null;
  label: string;
  labelI18n: string | null; // JSON 字符串
  url: string | null;
  sort: number;
  visible: boolean;
  target: string;
}

export async function listNavItems() {
  return prisma.navItem.findMany({ orderBy: [{ sort: "asc" }, { id: "asc" }] });
}

export async function saveNavItem(input: NavItemInput) {
  const data = {
    parentId: input.parentId,
    categoryId: input.categoryId,
    label: input.label,
    labelI18n: input.labelI18n,
    url: input.url || null,
    sort: input.sort,
    visible: input.visible,
    target: input.target === "_blank" ? "_blank" : "_self",
  };
  const item = input.id
    ? await prisma.navItem.update({ where: { id: input.id }, data })
    : await prisma.navItem.create({ data });
  await invalidateNavCache();
  return item;
}

export async function deleteNavItem(id: number) {
  await prisma.navItem.deleteMany({ where: { OR: [{ id }, { parentId: id }] } });
  await invalidateNavCache();
}

// ---------------- 内容(后台) ----------------

export interface ContentListQuery {
  page?: number;
  pageSize?: number;
  categoryId?: number;
  status?: string;
  source?: string;
  keyword?: string;
  /** 创建时间范围筛选(测试反馈新增需求④),ISO 日期字符串,闭区间 */
  dateFrom?: string;
  dateTo?: string;
}

/** 后台内容列表(含默认语言标题) */
export async function listContentsAdmin(q: ContentListQuery) {
  await promoteScheduled();
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(100, q.pageSize ?? 20);
  const createdAt =
    q.dateFrom || q.dateTo
      ? {
          ...(q.dateFrom ? { gte: new Date(`${q.dateFrom}T00:00:00`) } : {}),
          ...(q.dateTo ? { lte: new Date(`${q.dateTo}T23:59:59.999`) } : {}),
        }
      : undefined;
  const where = {
    ...(q.categoryId ? { categoryId: q.categoryId } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.source ? { source: q.source } : {}),
    ...(q.keyword ? { translations: { some: { title: { contains: q.keyword } } } } : {}),
    ...(createdAt ? { createdAt } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.content.count({ where }),
    prisma.content.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        translations: true,
        category: { include: { translations: true } },
      },
    }),
  ]);
  return { total, page, pageSize, items };
}

export interface ContentInput {
  id?: number;
  slug: string;
  categoryId: number;
  status: ContentStatus;
  authorName: string; // 作者显示名(后台必填;UGC 投稿由 submitUserContent 自动取昵称,不经此入口)
  coverUrl: string | null;
  formId?: number | null; // 挂载到详情页底部的表单
  publishAt: string | null; // ISO 字符串
  gallery?: string[] | null; // 商品图集(有序图片路径,仅 product 栏目使用);未传=不改动
  specs?: ProductSpec[] | null; // 商品规格参数(有序键值对);未传=不改动
  price?: { priceCents: number | null; currency: string | null } | null; // 交易字段(V4.0);未传=不改动;null 值=清除价格(转仅询盘)
  spu?: string | null; // 商品货号(V4.0.2);未传=不改动;null=清除
  translations: {
    locale: string;
    title: string;
    summary?: string | null;
    body: string;
    seoTitle?: string | null;
    seoKeywords?: string | null;
    seoDesc?: string | null;
    /**
     * 该语言规格参数(V3.1 REQ-001 写入语义矩阵):
     * 数组=该语言值(可为空数组,序列化后存 NULL)/ null=该语言无规格(写 NULL)/
     * undefined(缺省)=保留该语言既有值(deleteMany+recreate 前快照回填)。
     * 顶层 specs 仅写 Content.specs 兜底列,不触碰翻译行。
     */
    specs?: ProductSpec[] | null;
  }[];
}

/** 图集序列化:数组 → JSON 串(空数组存 null);上限 20 张,应用层强约束(SQLite 无枚举/校验) */
function serializeGallery(urls: string[] | null | undefined): string | null | undefined {
  if (urls === undefined) return undefined; // 未传:不改动既有值
  if (urls === null) return null; // 显式 null:清空
  if (urls.length > 20) throw new Error("图集最多上传 20 张图片");
  const clean = urls.map((u) => String(u).trim()).filter(Boolean);
  return clean.length > 0 ? JSON.stringify(clean) : null;
}

/** 规格参数序列化:[{k,v}] → JSON 串(空数组存 null);上限 50 行,键值非空(空行丢弃) */
function serializeSpecs(rows: ProductSpec[] | null | undefined): string | null | undefined {
  if (rows === undefined) return undefined; // 未传:不改动既有值
  if (rows === null) return null; // 显式 null:清空
  if (rows.length > 50) throw new Error("规格参数最多 50 行");
  const clean = rows
    .map((r) => ({ k: String(r?.k ?? "").trim(), v: String(r?.v ?? "").trim() }))
    .filter((r) => r.k !== "" && r.v !== "");
  return clean.length > 0 ? JSON.stringify(clean) : null;
}

/**
 * 翻译行 specs 三态归一(V3.1 REQ-001 写入语义矩阵):
 * undefined=快照回填保留既有;数组=serializeSpecs 序列化写入(空数组存 NULL);null=清空(NULL)。
 */
function resolveTranslationSpecs(
  value: ProductSpec[] | null | undefined,
  snapshot: string | null
): string | null {
  if (value === undefined) return snapshot;
  return serializeSpecs(value) ?? null;
}

/** 新建/更新内容(后台) */
export async function saveContent(
  input: ContentInput,
  source: string = CONTENT_SOURCE.ADMIN,
  authorUserId?: number
) {
  const withTitle = input.translations.filter((t) => t.title.trim());
  if (withTitle.length === 0) throw new Error("至少填写一种语言的标题");
  const authorName = input.authorName?.trim();
  if (!authorName) throw new Error("请填写作者");

  // 定时发布必须带时间;时间已过则直接发布
  let status: string = input.status;
  let publishAt: Date | null = input.publishAt ? new Date(input.publishAt) : null;
  if (status === CONTENT_STATUS.SCHEDULED) {
    if (!publishAt) throw new Error("定时发布需要设置发布时间");
    if (publishAt <= new Date()) {
      status = CONTENT_STATUS.PUBLISHED;
      publishAt = null;
    }
  }

  const galleryJson = serializeGallery(input.gallery);
  const specsJson = serializeSpecs(input.specs);
  const data = {
    slug: input.slug,
    categoryId: input.categoryId,
    status,
    authorName,
    coverUrl: input.coverUrl || null,
    formId: input.formId ?? null,
    publishAt,
    // 商品图集/规格参数(V3.0):传了才写(未传保留既有值),空数组存 null
    ...(galleryJson !== undefined ? { gallery: galleryJson } : {}),
    ...(specsJson !== undefined ? { specs: specsJson } : {}),
    // SPU(V4.0.2):传了才写
    ...(input.spu !== undefined ? { spu: input.spu?.trim().slice(0, 60) || null } : {}),
    // 交易字段(V4.0):传了才写;currency 缺省跟随站点默认(null)
    ...(input.price
      ? {
          priceCents:
            input.price.priceCents == null
              ? null
              : Math.max(0, Math.floor(Number(input.price.priceCents))),
          currency:
            input.price.priceCents == null || !input.price.currency
              ? null
              : String(input.price.currency).toUpperCase().slice(0, 3),
        }
      : {}),
    ...(input.id ? {} : { source, authorUserId: authorUserId ?? null }),
  };

  const content = input.id
    ? await prisma.content.update({ where: { id: input.id }, data })
    : await prisma.content.create({ data });

  // 翻译行重建前快照各语言旧 specs(deleteMany+recreate 会整行重建;
  // 注:快照读在事务外,与删除间存在并发窗口;admin 单编辑者场景已评估接受(评审 Low-3)
  // V3.1 REQ-001:translations[].specs 缺省=保留既有,靠快照回填,不丢存量多语言规格)
  const prevSpecs = new Map(
    (
      await prisma.contentTranslation.findMany({
        where: { contentId: content.id },
        select: { locale: true, specs: true },
      })
    ).map((r) => [r.locale, r.specs])
  );

  await prisma.$transaction([
    prisma.contentTranslation.deleteMany({ where: { contentId: content.id } }),
    ...withTitle.map((t) =>
      prisma.contentTranslation.create({
        data: {
          contentId: content.id,
          locale: t.locale,
          title: t.title,
          summary: t.summary ?? null,
          body: t.body,
          seoTitle: t.seoTitle ?? null,
          seoKeywords: t.seoKeywords ?? null,
          seoDesc: t.seoDesc ?? null,
          specs: resolveTranslationSpecs(t.specs, prevSpecs.get(t.locale) ?? null),
        },
      })
    ),
  ]);
  return content;
}

export async function getContentForEdit(id: number) {
  const content = await prisma.content.findUnique({
    where: { id },
    include: { translations: true },
  });
  if (!content) return null;
  // V3.1 REQ-001:每语言 translation 返回解析后的 specs 数组(供编辑器全量往返;
  // NULL/非法 JSON 沿 parseSpecs 容错为 [],编辑器回显空编辑器)
  return {
    ...content,
    translations: content.translations.map((t) => ({
      ...t,
      specs: parseSpecs(t.specs),
    })),
  };
}

/** llms.txt 数据源:可见栏目名(指定语言,缺省回退第一条翻译) */
export async function listCategoriesWithNames(locale: string) {
  const cats = await prisma.category.findMany({
    where: { visible: true },
    orderBy: { sort: "asc" },
    include: { translations: true },
  });
  return cats.map((c) => ({
    slug: c.slug,
    name:
      c.translations.find((x) => x.locale === locale)?.name ?? c.translations[0]?.name ?? c.slug,
  }));
}

/** llms.txt 数据源:已发布内容的标题与摘要(指定语言,缺省回退第一条翻译) */
export async function listForLlms(locale: string) {
  const rows = await prisma.content.findMany({
    where: { status: CONTENT_STATUS.PUBLISHED },
    orderBy: [{ publishAt: "desc" }, { id: "desc" }],
    include: { translations: true, category: { include: { translations: true } } },
  });
  return rows.map((r) => {
    const t = r.translations.find((x) => x.locale === locale) ?? r.translations[0];
    const cat =
      r.category.translations.find((x) => x.locale === locale) ?? r.category.translations[0];
    return {
      slug: r.slug,
      title: t?.title ?? r.slug,
      summary: t?.summary ?? "",
      categorySlug: r.category.slug,
      categoryName: cat?.name ?? r.category.slug,
      moduleType: r.category.moduleType, // 前台按模块类型分流(llms.txt 产品分区用)
    };
  });
}

export async function deleteContent(id: number) {
  // V3.0(M-2):Favorite.targetId 无外键(应用层维护一致性),删除内容时事务内级联清理收藏行
  await prisma.$transaction([
    prisma.favorite.deleteMany({ where: { targetType: TARGET_TYPE.CONTENT, targetId: id } }),
    prisma.content.delete({ where: { id } }),
  ]);
}

// ---------------- 内容(前台) ----------------

/** 收集栏目全部后代 id(逐层下探,不限层级;隐藏栏目及其子树不参与聚合,与既有可见性语义一致) */
async function collectDescendantIds(rootId: number): Promise<number[]> {
  const ids: number[] = [];
  let frontier = [rootId];
  while (frontier.length > 0) {
    const children = await prisma.category.findMany({
      where: { parentId: { in: frontier }, visible: true },
      select: { id: true },
    });
    frontier = children.map((c) => c.id);
    ids.push(...frontier);
  }
  return ids;
}

/** 栏目页列表(仅已发布;商品栏目聚合其全部后代栏目,父栏目页聚合子栏目商品) */
export interface CategoryListFilter {
  q?: string; // 关键词(标题/摘要 contains)
  minPriceCents?: number; // 价格区间(整数分;含价格筛选时无价商品自然排除)
  maxPriceCents?: number;
  sort?: "latest" | "priceAsc" | "priceDesc";
}

export async function listPublishedByCategory(
  categorySlug: string,
  locale: string,
  page = 1,
  pageSize = 12,
  filter: CategoryListFilter = {}
) {
  await promoteScheduled();
  const category = await prisma.category.findUnique({
    where: { slug: categorySlug },
    include: {
      translations: true,
      children: { where: { visible: true }, include: { translations: true } },
    },
  });
  if (!category || !category.visible) return null;

  // 栏目集合(M-1):product 栏目用全后代递归(V3.0 二级分类浏览的数据基础);
  // 非 product 栏目恢复基线行为(本栏目 + 直接子栏目),深层级不聚合
  const isProduct = category.moduleType === "product";
  const descendantIds = isProduct ? await collectDescendantIds(category.id) : [];
  const catIds = isProduct
    ? [category.id, ...descendantIds]
    : [category.id, ...category.children.map((c) => c.id)];
  const where: Record<string, unknown> = { categoryId: { in: catIds }, status: CONTENT_STATUS.PUBLISHED };
  const and: Record<string, unknown>[] = [];
  const q = filter.q?.trim();
  if (q) {
    and.push({
      translations: { some: { OR: [{ title: { contains: q } }, { summary: { contains: q } }] } },
    });
  }
  if (filter.minPriceCents != null) and.push({ priceCents: { gte: filter.minPriceCents } });
  if (filter.maxPriceCents != null) and.push({ priceCents: { lte: filter.maxPriceCents } });
  if (and.length) where.AND = and;
  // 价格排序只对有价商品生效(点价格排序即想比价;无价商品仍出现在最新排序)
  const orderBy: Record<string, "asc" | "desc">[] =
    filter.sort === "priceAsc" || filter.sort === "priceDesc"
      ? [{ priceCents: filter.sort === "priceAsc" ? "asc" : "desc" }, { id: "desc" }]
      : [{ publishAt: "desc" }, { id: "desc" }];
  const [total, items] = await Promise.all([
    prisma.content.count({ where }),
    prisma.content.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      // 投影排除 gallery/specs(NFR-006):大字段仅详情页读取,防止列表性能退化
      select: {
        id: true,
        slug: true,
        coverUrl: true,
        viewCount: true,
        likeCount: true,
        publishAt: true,
        createdAt: true,
        priceCents: true,
        currency: true,
        translations: { select: { locale: true, title: true, summary: true } },
      },
    }),
  ]);

  return {
    category: {
      id: category.id,
      slug: category.slug,
      moduleType: category.moduleType,
      allowSubmit: category.allowSubmit,
      name:
        category.translations.find((t) => t.locale === locale)?.name ??
        category.translations[0]?.name ??
        category.slug,
      description:
        category.translations.find((t) => t.locale === locale)?.description ??
        category.translations[0]?.description ??
        null,
      seo:
        category.translations.find((t) => t.locale === locale) ?? category.translations[0] ?? null,
      // 可见直接子栏目(父栏目页子分类页签的数据基础;深层级过滤已含在列表查询内)
      children: category.children.map((c) => ({
        id: c.id,
        slug: c.slug,
        name:
          c.translations.find((t) => t.locale === locale)?.name ??
          c.translations[0]?.name ??
          c.slug,
      })),
    },
    total,
    page,
    pageSize,
    items: items.map((c) => shapeCard(c, locale)),
  };
}

/** 详情页(仅已发布可见) */
export async function getPublishedBySlug(slug: string, locale: string) {
  await promoteScheduled();
  const content = await prisma.content.findUnique({
    where: { slug },
    include: { translations: true, category: { include: { translations: true } } },
  });
  if (!content || content.status !== CONTENT_STATUS.PUBLISHED) return null;

  const t = content.translations.find((x) => x.locale === locale) ?? content.translations[0];
  if (!t) return null;
  return {
    id: content.id,
    slug: content.slug,
    coverUrl: content.coverUrl,
    formId: content.formId,
    authorName: content.authorName,
    viewCount: content.viewCount,
    likeCount: content.likeCount,
    shareCount: content.shareCount,
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
  };
}

/** 首页最新已发布内容 */
export async function listLatestPublished(locale: string, take = 6) {
  await promoteScheduled();
  const items = await prisma.content.findMany({
    where: { status: CONTENT_STATUS.PUBLISHED, category: { visible: true } },
    orderBy: [{ publishAt: "desc" }, { id: "desc" }],
    take,
    include: { translations: true, category: { select: { moduleType: true } } },
  });
  return items.map((c) => shapeCard(c, locale, c.category?.moduleType));
}

/** 站点地图数据:全部已发布内容与可见栏目 */
export async function listForSitemap() {
  await promoteScheduled();
  const [contents, categories] = await Promise.all([
    prisma.content.findMany({
      where: { status: CONTENT_STATUS.PUBLISHED },
      select: { slug: true, updatedAt: true },
    }),
    prisma.category.findMany({
      where: { visible: true, externalUrl: null },
      select: { slug: true },
    }),
  ]);
  return { contents, categories };
}

/** 列表卡片数据形态(标题按语言兜底) */
function shapeCard(
  c: {
    id: number;
    slug: string;
    coverUrl: string | null;
    viewCount: number;
    likeCount: number;
    publishAt: Date | null;
    createdAt: Date;
    priceCents?: number | null;
    currency?: string | null;
    translations: { locale: string; title: string; summary: string | null }[];
    category?: { moduleType: string };
  },
  locale: string,
  moduleType?: string
) {
  const t = c.translations.find((x) => x.locale === locale) ?? c.translations[0];
  return {
    id: c.id,
    slug: c.slug,
    coverUrl: c.coverUrl,
    viewCount: c.viewCount,
    likeCount: c.likeCount,
    publishedAt: c.publishAt ?? c.createdAt,
    title: t?.title ?? "",
    summary: t?.summary ?? null,
    moduleType: moduleType ?? c.category?.moduleType,
    priceCents: c.priceCents ?? null,
    currency: c.currency ?? null,
  };
}
