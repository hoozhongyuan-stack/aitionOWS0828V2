import { prisma } from "@/lib/db";

/**
 * 导航读取服务(前台页头使用)。
 * 数据来源:NavItem 表(可关联栏目或自定义链接)。
 * 空表时回退默认导航(首页),保证模板开箱可用。
 */

export interface NavLink {
  id: number;
  label: string; // 已按语言解析
  href: string;
  target: string;
  children: NavLink[];
}

type Cache = Map<string, NavLink[]>; // locale -> 树
const g = globalThis as unknown as { __aitionNavCache?: Cache };
const cache: Cache = (g.__aitionNavCache ??= new Map());

/** 解析多语言 label(labelI18n JSON 优先,关联栏目时兜底栏目译名,否则兜底固定 label) */
function resolveLabel(
  item: { label: string; labelI18n: string | null },
  locale: string,
  categoryName?: string
): string {
  if (item.labelI18n) {
    try {
      const map = JSON.parse(item.labelI18n) as Record<string, string>;
      if (map[locale]) return map[locale];
    } catch {
      /* 忽略脏数据 */
    }
  }
  // 关联栏目时,栏目名已按语言维护翻译,应优先于导航项自身的固定 label
  // (item.label 是不区分语言的默认值,只作为兜底,避免导航项遗漏 labelI18n
  //  时长期停留在创建时的语言,不随前台语言切换)
  return categoryName || item.label || "";
}

/** 前台可见导航树(按语言解析文案与链接) */
export async function getVisibleNav(locale: string): Promise<NavLink[]> {
  const hit = cache.get(locale);
  if (hit) return hit;

  const items = await prisma.navItem.findMany({
    where: { visible: true },
    orderBy: { sort: "asc" },
  });

  // 关联栏目信息(名称翻译 + slug)
  const catIds = items.map((i) => i.categoryId).filter((v): v is number => v != null);
  const cats = catIds.length
    ? await prisma.category.findMany({
        where: { id: { in: catIds } },
        include: { translations: true },
      })
    : [];
  const catById = new Map(cats.map((c) => [c.id, c]));

  function toLink(item: (typeof items)[number]): NavLink | null {
    let href = item.url || "";
    let catName: string | undefined;
    if (item.categoryId) {
      const cat = catById.get(item.categoryId);
      if (!cat || !cat.visible) return null;
      href = cat.externalUrl || `/${locale}/c/${cat.slug}`;
      catName =
        cat.translations.find((t) => t.locale === locale)?.name ?? cat.translations[0]?.name;
    } else if (href && !href.startsWith("http") && !href.startsWith(`/${locale}`)) {
      // 站内相对链接自动补语言前缀
      href = `/${locale}${href.startsWith("/") ? "" : "/"}${href}`;
    }
    const label = resolveLabel(item, locale, catName);
    if (!label || !href) return null;
    return { id: item.id, label, href, target: item.target, children: [] };
  }

  const roots: NavLink[] = [];
  const byId = new Map<number, NavLink>();
  for (const item of items.filter((i) => !i.parentId)) {
    const link = toLink(item);
    if (link) {
      byId.set(item.id, link);
      roots.push(link);
    }
  }
  for (const item of items.filter((i) => i.parentId)) {
    const parent = item.parentId ? byId.get(item.parentId) : undefined;
    const link = toLink(item);
    if (parent && link) parent.children.push(link);
  }

  cache.set(locale, roots);
  return roots;
}

/** 导航缓存失效(NavItem/Category 写入后调用) */
export async function invalidateNavCache(): Promise<void> {
  cache.clear();
  // 预热可选:此处保持惰性
}
