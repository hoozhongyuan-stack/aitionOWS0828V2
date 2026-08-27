import { prisma } from "@/lib/db";

/**
 * 首页顶部通屏轮播图(新增需求①):
 * 后台最多维护 5 张,整组覆盖式保存(数组顺序即展示顺序),与栏目/导航等
 * 简单列表配置(如社交账号)保持同样的编辑体验 —— 不做增量 diff,直接推倒重建。
 */
export const MAX_BANNERS = 5;

export interface BannerInput {
  imageUrl: string;
  linkUrl: string | null;
  enabled: boolean;
}

/** 后台:全部轮播图(含禁用),按排序展示 */
export async function listBanners() {
  return prisma.banner.findMany({ orderBy: { sort: "asc" } });
}

/** 前台首页:仅启用的轮播图,按排序,最多 MAX_BANNERS 张 */
export async function getActiveBanners() {
  return prisma.banner.findMany({
    where: { enabled: true },
    orderBy: { sort: "asc" },
    take: MAX_BANNERS,
  });
}

/** 整组保存:数组下标即最终排序值 */
export async function saveBanners(items: BannerInput[]) {
  if (items.length > MAX_BANNERS) throw new Error(`轮播图最多支持 ${MAX_BANNERS} 张`);
  for (const it of items) {
    if (!it.imageUrl.trim()) throw new Error("每张轮播图都需要上传图片");
  }
  await prisma.$transaction([
    prisma.banner.deleteMany({}),
    ...items.map((it, i) =>
      prisma.banner.create({
        data: { imageUrl: it.imageUrl, linkUrl: it.linkUrl || null, sort: i, enabled: it.enabled },
      })
    ),
  ]);
}
