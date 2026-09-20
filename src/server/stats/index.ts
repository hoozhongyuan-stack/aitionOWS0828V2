import { prisma } from "@/lib/db";
import { getStatsConfig } from "@/lib/config";
import {
  computeDisplayCounts,
  localDateString,
  type ContentStatFacts,
  type DailyRealViews,
  type DisplayCounts,
} from "./virtual";

/**
 * 拟真互动数据 —— 服务层(V4.8.0)。
 *
 * 前台所有出口(列表卡片 / 详情页 / 互动接口回包)都从这里取展示值,保证同源一致:
 * 列表显示 128、详情显示 130 这类自相矛盾不会发生。
 *
 * 关闭总开关(默认)时本层零成本直接返回真实值,不产生任何额外查询。
 */

export type { DisplayCounts } from "./virtual";

/** 服务层入参:一篇内容参与合成的全部事实 */
export interface StatSource {
  id: number;
  publishedAt: Date;
  viewCount: number;
  likeCount: number;
  shareCount: number;
  statsMode?: string | null;
  statsBase?: number | null;
  statsSalt?: string | null;
  /** V4.8.0:内容状态(传了才做"未发布不拟真"的判定) */
  status?: string | null;
}

function toFacts(item: StatSource): ContentStatFacts {
  return {
    id: item.id,
    publishedAt: item.publishedAt,
    realViews: item.viewCount,
    realLikes: item.likeCount,
    realShares: item.shareCount,
    statsMode: item.statsMode ?? "AUTO",
    statsBase: item.statsBase ?? null,
    statsSalt: item.statsSalt ?? null,
    status: item.status ?? undefined,
  };
}

function realCounts(item: StatSource): DisplayCounts {
  return { views: item.viewCount, likes: item.likeCount, shares: item.shareCount };
}

/**
 * 批量合成展示值:id → { views, likes, shares }。
 * 只对"需要放大"的内容查一次日表(有 contentId 索引,且只有发生过真实阅读的内容才有行)。
 */
export async function resolveDisplayCounts(
  items: readonly StatSource[],
  now: Date = new Date()
): Promise<Map<number, DisplayCounts>> {
  const out = new Map<number, DisplayCounts>();
  if (!items.length) return out;

  const cfg = await getStatsConfig();
  if (!cfg.enabled) {
    for (const it of items) out.set(it.id, realCounts(it));
    return out;
  }

  const needDaily = items.filter((it) => (it.statsMode ?? "AUTO") !== "OFF");
  const dailyByContent = new Map<number, DailyRealViews[]>();
  if (needDaily.length) {
    const rows = await prisma.contentDailyView.findMany({
      where: { contentId: { in: needDaily.map((it) => it.id) } },
      select: { contentId: true, date: true, views: true },
    });
    for (const r of rows) {
      const list = dailyByContent.get(r.contentId);
      if (list) list.push({ date: r.date, views: r.views });
      else dailyByContent.set(r.contentId, [{ date: r.date, views: r.views }]);
    }
  }

  for (const it of items) {
    out.set(it.id, computeDisplayCounts(toFacts(it), dailyByContent.get(it.id) ?? [], cfg, now));
  }
  return out;
}

/** 单篇(接口回包用):找不到内容时返回 null,由调用方决定回显 */
export async function resolveDisplayCountsById(
  id: number,
  now: Date = new Date()
): Promise<DisplayCounts | null> {
  const row = await prisma.content.findUnique({
    where: { id },
    select: {
      id: true,
      publishAt: true,
      createdAt: true,
      viewCount: true,
      likeCount: true,
      shareCount: true,
      statsMode: true,
      statsBase: true,
      statsSalt: true,
    },
  });
  if (!row) return null;
  const map = await resolveDisplayCounts(
    [{ ...row, publishedAt: row.publishAt ?? row.createdAt }],
    now
  );
  return map.get(row.id) ?? null;
}

/**
 * 记录一次真实阅读(逐日明细,供放大延迟释放使用)。
 * 与真实计数分属两处:真实计数在 Content.viewCount,这里只是"哪天发生的"时间线。
 */
export async function recordRealViewDay(contentId: number, at: Date = new Date()): Promise<void> {
  const date = localDateString(at);
  await prisma.contentDailyView.upsert({
    where: { contentId_date: { contentId, date } },
    update: { views: { increment: 1 } },
    create: { contentId, date, views: 1 },
  });
}
