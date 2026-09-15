import { prisma } from "@/lib/db";
import { CONTENT_STATUS, CONTENT_SOURCE, TARGET_TYPE, type ContentStatus } from "@/types/domain";
import { invalidateNavCache } from "./nav";
import { parseSpecs, type ProductSpec } from "./product";
import { parseKeywords } from "@/lib/keywords";

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

/**
 * V4.4.0 批量用:栏目显隐(只改 visible 一个字段)。
 * 不走 saveCategory(整体覆盖语义,批量场景拿不到完整字段)。
 */
export async function setCategoryVisible(id: number, visible: boolean): Promise<void> {
  await prisma.category.update({ where: { id }, data: { visible: Boolean(visible) } });
  await invalidateNavCache();
}

/** V4.4.0 批量用:导航项显隐(只改 visible) */
export async function setNavItemVisible(id: number, visible: boolean): Promise<void> {
  await prisma.navItem.update({ where: { id }, data: { visible: Boolean(visible) } });
  await invalidateNavCache();
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
  // V4.7.2:默认与后台界面的「每页」一致(10),并补下界防止传 0 取到空页
  const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 10));
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
      publishAt = new Date(); // V4.6.2:定时到期转立即发布,落真实面世时刻
    }
  }
  // V4.6.2 发布时间语义:PUBLISHED 且未显式给定时时间 → 保留既有发布时间
  // (编辑保存不再清空);既有也为空(首次立即发布/历史数据)则落当前时刻
  if (status === CONTENT_STATUS.PUBLISHED && !publishAt && input.id) {
    const existing = await prisma.content.findUnique({
      where: { id: input.id },
      select: { publishAt: true },
    });
    publishAt = existing?.publishAt ?? new Date();
  } else if (status === CONTENT_STATUS.PUBLISHED && !publishAt && !input.id) {
    publishAt = new Date();
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

/**
 * 列表页「定制发布」（V4.3.0）：只改 status 与 publishAt 两个字段。
 * 与 saveContent 的**整体覆盖**语义明确区分——列表页拿不到完整字段，
 * 若走 PUT 会清空正文与翻译（V4.1.2 价格事故同类风险），故单独开此入口。
 */
export async function updateContentSchedule(input: {
  id: number;
  action: "publish" | "schedule" | "draft" | "offline";
  publishAt?: string | null;
}) {
  let data: { status: string; publishAt: Date | null };
  if (input.action === "publish") {
    // V4.6.2:立即发布写入真实面世时刻(此前为 null → 列表显示「(立即发布)」且前台回退创建时间)
    data = { status: CONTENT_STATUS.PUBLISHED, publishAt: new Date() };
  } else if (input.action === "draft") {
    data = { status: CONTENT_STATUS.DRAFT, publishAt: null };
  } else if (input.action === "offline") {
    data = { status: CONTENT_STATUS.OFFLINE, publishAt: null };
  } else {
    if (!input.publishAt) throw new Error("定时发布需要提供发布时间");
    const at = new Date(input.publishAt);
    if (Number.isNaN(at.getTime())) throw new Error("发布时间不是合法时间");
    if (at.getTime() <= Date.now()) {
      throw new Error("定时发布时间必须晚于当前时间（如需立刻上线请用「立即发布」）");
    }
    data = { status: CONTENT_STATUS.SCHEDULED, publishAt: at };
  }
  const updated = await prisma.content.update({ where: { id: input.id }, data });
  return {
    id: updated.id,
    status: updated.status,
    publishAt: updated.publishAt ? updated.publishAt.toISOString() : null,
  };
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
        // V4.7.0:列表卡片展示作者,需一并取出(此前列表侧无作者字段)
        authorName: true,
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

/**
 * 详情页(仅已发布可见)。
 * V4.3.0 前台预览:`allowUnpublished` 放行未发布内容(DRAFT/SCHEDULED/OFFLINE)——
 * **调用方必须先完成管理员鉴权**(见详情页的 getGuardedAdmin 检查),本函数不做鉴权。
 */
export async function getPublishedBySlug(
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
  if (content.status !== CONTENT_STATUS.PUBLISHED && !opts?.allowUnpublished) return null;

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

/** 站内搜索单条结果(卡片数据 + 是否命中标题,供排序与高亮) */
export interface SearchHit {
  id: number;
  slug: string;
  title: string;
  summary: string | null;
  coverUrl: string | null;
  authorName: string | null;
  publishedAt: Date;
  moduleType: string;
  categoryName: string;
  /** 标题命中(用于"标题命中优先"排序) */
  titleHit: boolean;
}

/** 搜索引擎内匹配上限:超出部分不参与排序(规模上限,超过再评估 FTS5) */
const SEARCH_SCAN_LIMIT = 200;

/**
 * 站内全站搜索(V4.7.2)。
 *
 * 范围:可见栏目下的已发布内容;匹配 标题 / 摘要 / 关键词(seoKeywords)/ 栏目名
 * (标题命中优先,其次发布时间倒序)。
 * 有意**不搜正文**:正文是大字段,SQLite `LIKE '%x%'` 无法走索引,量大后是性能坑
 * —— 待内容量级上来再评估 FTS5(中文需 trigram/jieba 分词,成本较高)。
 * 实现上先取匹配集(上限 SEARCH_SCAN_LIMIT),再在服务端排序后分页。
 */
export async function searchPublished(
  locale: string,
  q: string,
  opts: { type?: "all" | "article" | "product"; page?: number; pageSize?: number } = {}
): Promise<{ total: number; page: number; pageSize: number; items: SearchHit[]; hitLimit: boolean }> {
  await promoteScheduled();
  const kw = q.trim();
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 12));
  if (!kw) return { total: 0, page, pageSize, items: [], hitLimit: false };

  const matches = await prisma.content.findMany({
    where: {
      status: CONTENT_STATUS.PUBLISHED,
      category: { visible: true },
      OR: [
        {
          translations: {
            some: {
              locale,
              OR: [
                { title: { contains: kw } },
                { summary: { contains: kw } },
                // 关键词也参与匹配(V4.7.2):详情页的关键词 chip 会跳到 /search?q=<关键词>,
                // 若只搜标题/摘要,点了 chip 却查无结果 —— seoKeywords 是小字段,代价可忽略。
                { seoKeywords: { contains: kw } },
              ],
            },
          },
        },
        { category: { translations: { some: { name: { contains: kw } } } } },
      ],
    },
    orderBy: [{ publishAt: "desc" }, { id: "desc" }],
    take: SEARCH_SCAN_LIMIT,
    select: {
      id: true,
      slug: true,
      coverUrl: true,
      authorName: true,
      publishAt: true,
      createdAt: true,
      translations: { select: { locale: true, title: true, summary: true } },
      category: {
        select: { moduleType: true, translations: { select: { locale: true, name: true } } },
      },
    },
  });

  const shaped: SearchHit[] = matches.map((c) => {
    const t = c.translations.find((x) => x.locale === locale) ?? c.translations[0];
    const catName =
      c.category.translations.find((x) => x.locale === locale)?.name ??
      c.category.translations[0]?.name ??
      "";
    const title = t?.title ?? "";
    return {
      id: c.id,
      slug: c.slug,
      title,
      summary: t?.summary ?? null,
      coverUrl: c.coverUrl,
      authorName: c.authorName ?? null,
      publishedAt: c.publishAt ?? c.createdAt,
      moduleType: c.category.moduleType,
      categoryName: catName,
      titleHit: title.toLowerCase().includes(kw.toLowerCase()),
    };
  });

  // 类型过滤(在匹配集内过滤:type 只影响展示分组,不改变"匹配"语义)
  const type = opts.type ?? "all";
  const filtered =
    type === "all" ? shaped : shaped.filter((h) => (type === "product" ? h.moduleType === "product" : h.moduleType !== "product"));

  // 标题命中优先,其次发布时间倒序(已按 publishAt 取回,这里只做稳定分组)
  const sorted = [...filtered].sort((a, b) => {
    if (a.titleHit !== b.titleHit) return a.titleHit ? -1 : 1;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });

  return {
    total: sorted.length,
    page,
    pageSize,
    items: sorted.slice((page - 1) * pageSize, page * pageSize),
    hitLimit: matches.length >= SEARCH_SCAN_LIMIT,
  };
}

/** 热门关键词(V4.7.2):聚合已发布内容的 seoKeywords,按出现频次取前 N(搜索页空态兜底) */
export async function getPopularKeywords(locale: string, limit = 12): Promise<string[]> {
  const rows = await prisma.content.findMany({
    where: { status: CONTENT_STATUS.PUBLISHED, category: { visible: true } },
    select: { translations: { select: { locale: true, seoKeywords: true } } },
  });
  const freq = new Map<string, number>();
  for (const c of rows) {
    const t = c.translations.find((x) => x.locale === locale) ?? c.translations[0];
    for (const k of parseKeywords(t?.seoKeywords)) {
      freq.set(k, (freq.get(k) ?? 0) + 1);
    }
  }
  return [...freq.entries()]
    .sort((a, b) => (b[1] - a[1] !== 0 ? b[1] - a[1] : a[0].localeCompare(b[0], "zh-CN")))
    .slice(0, limit)
    .map(([k]) => k);
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
    authorName?: string | null;
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
    authorName: c.authorName ?? null,
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

// ============================================================
// V4.2 商品管理(交易模块入口):数据仍为 Content(product 栏目),管理视图剥离
// ============================================================

/** 商品管理列表(交易组):仅 product 类栏目下的内容,带价格/SPU/封面/栏目名 */
export async function listProductsAdmin(q: { keyword?: string; categoryId?: number; status?: string; page?: number; pageSize?: number }) {
  await promoteScheduled();
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 10));
  const cats = await prisma.category.findMany({
    where: { moduleType: "product" },
    select: { id: true },
  });
  const catIds = cats.map((c) => c.id);
  const where: Record<string, unknown> = {
    categoryId: { in: q.categoryId ? [q.categoryId] : catIds },
  };
  if (q.status) where.status = q.status;
  const kw = q.keyword?.trim();
  if (kw) where.translations = { some: { title: { contains: kw } } };
  const [total, items] = await Promise.all([
    prisma.content.count({ where }),
    prisma.content.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        slug: true,
        status: true,
        coverUrl: true,
        priceCents: true,
        currency: true,
        spu: true,
        categoryId: true,
        updatedAt: true, // V4.4.0:商品列表视图的「更新时间」列需要
        translations: { select: { locale: true, title: true } },
        category: { select: { translations: { select: { locale: true, name: true } } } },
      },
    }),
  ]);
  const nameOf = (rows: { locale: string; name?: string; title?: string }[], fallback: string) =>
    (rows.find((r) => r.locale === "zh-CN") ?? rows[0])?.name ?? (rows.find((r) => r.locale === "zh-CN") ?? rows[0])?.title ?? fallback;
  return {
    total,
    page,
    pageSize,
    items: items.map((c) => ({
      id: c.id,
      slug: c.slug,
      status: c.status,
      coverUrl: c.coverUrl,
      priceCents: c.priceCents,
      currency: c.currency,
      spu: c.spu,
      categoryId: c.categoryId,
      updatedAt: c.updatedAt.toISOString(),
      title: nameOf(c.translations as never, c.slug),
      categoryName: nameOf(c.category.translations as never, "-"),
    })),
  };
}

/** 商品可选栏目(product 类,新建/筛选下拉用) */
export async function listProductCategories() {
  return prisma.category.findMany({
    where: { moduleType: "product" },
    orderBy: [{ sort: "asc" }, { id: "asc" }],
    select: { id: true, translations: { select: { locale: true, name: true } } },
  });
}
