import { z } from "zod";
import { jsonOk, jsonErr, parseBody } from "@/lib/api";
import { prisma } from "@/lib/db";
import { TARGET_TYPE, CONTENT_STATUS } from "@/types/domain";
import { resolveDisplayCounts, resolveDisplayCountsById } from "@/server/stats";

/**
 * 收藏域(需求 V3.0 REQ-005,独立可测量模块——NFR-005 覆盖率口径)。
 * 从 src/server/ugc/index.ts 与收藏 route 拆出;index.ts 经 re-export 保持
 * `import { toggleFavorite } from "@/server/ugc"` 等既有导入路径不变。
 */

/** 收藏目标不存在或未发布的语义错误(路由层映射 HTTP 404;计数保持不变) */
export class FavoriteTargetNotFoundError extends Error {
  readonly status = 404;
  constructor(message = "内容不存在或未发布") {
    super(message);
    this.name = "FavoriteTargetNotFoundError";
  }
}

/** 收藏唯一键 @@unique([targetType, targetId, userId]) 对应的复合查询/写入键 */
function favoriteKey(contentId: number, userId: number) {
  return { targetType: TARGET_TYPE.CONTENT, targetId: contentId, userId };
}

/**
 * 收藏/取消收藏(切换语义):POST 一次调用 = 一次状态翻转。
 * 事务内维护 Favorite 行与 Content.favoriteCount 冗余计数;
 * 数据库唯一约束兜底并发重复:P2002 捕获后落到底部重查,返回当前真实状态。
 */
export async function toggleFavorite(input: {
  contentId: number;
  userId: number;
}): Promise<{ favorited: boolean; favoriteCount: number }> {
  const { contentId, userId } = input;
  const content = await prisma.content.findUnique({
    where: { id: contentId },
    select: { status: true },
  });
  if (!content || content.status !== CONTENT_STATUS.PUBLISHED) {
    throw new FavoriteTargetNotFoundError();
  }

  return prisma.$transaction(async (tx) => {
    const key = favoriteKey(contentId, userId);
    const existing = await tx.favorite.findUnique({
      where: { targetType_targetId_userId: key },
    });
    try {
      if (existing) {
        // deleteMany 幂等删除(替代 delete):并发取消场景下行可能已被另一请求删除,
        // delete 会抛 P2025;count===0 视为「已取消」,不再递减计数,不抛错。
        // (deleteMany 的 where 不支持复合唯一键简写,展开为等价的字段条件)
        const { count } = await tx.favorite.deleteMany({
          where: { targetType: TARGET_TYPE.CONTENT, targetId: contentId, userId },
        });
        if (count > 0) {
          await tx.content.updateMany({
            where: { id: contentId, favoriteCount: { gt: 0 } },
            data: { favoriteCount: { decrement: 1 } },
          });
        }
      } else {
        await tx.favorite.create({ data: key });
        await tx.content.update({
          where: { id: contentId },
          data: { favoriteCount: { increment: 1 } },
        });
      }
    } catch (e) {
      // 唯一约束并发兜底:另一并发请求已插入同一条收藏 → 吞掉 P2002,按当前态返回
      if ((e as { code?: string }).code !== "P2002") throw e;
    }
    const [row, favoritedRow] = await Promise.all([
      tx.content.findUnique({ where: { id: contentId }, select: { favoriteCount: true } }),
      tx.favorite.findUnique({ where: { targetType_targetId_userId: key } }),
    ]);
    return { favorited: !!favoritedRow, favoriteCount: row?.favoriteCount ?? 0 };
  });
}

/** 查询当前用户是否已收藏该内容(未登录恒 false) */
export async function hasFavorited(input: {
  contentId: number;
  userId?: number | null;
}): Promise<boolean> {
  if (!input.userId) return false;
  const row = await prisma.favorite.findUnique({
    where: {
      targetType_targetId_userId: favoriteKey(input.contentId, input.userId),
    },
  });
  return !!row;
}

/**
 * 个人收藏列表(个人中心「我的收藏」):按收藏时间倒序。
 * 标题/栏目名 locale 回退现有机制:指定语言 → 首条翻译 → slug;
 * moduleType 为文章/商品类型标识(news/product/…),供个人中心区分类型展示。
 */
export async function listMyFavorites(userId: number, locale: string) {
  const rows = await prisma.favorite.findMany({
    where: { userId, targetType: TARGET_TYPE.CONTENT },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  if (!rows.length) return [];
  const contents = await prisma.content.findMany({
    where: { id: { in: rows.map((r) => r.targetId) } },
    include: {
      // 「首条翻译」需要确定性:按 id 升序 = 创建顺序(无 ORDER BY 时 SQLite 返回顺序不稳定)
      translations: { orderBy: { id: "asc" } },
      category: { include: { translations: { orderBy: { id: "asc" } } } },
    },
  });
  const byId = new Map(contents.map((c) => [c.id, c]));
  // V4.8.0:个人中心也走展示值,避免"详情页显示 300+,我的收藏里显示 3"的自相矛盾
  const display = await resolveDisplayCounts(
    contents.map((c) => ({
      id: c.id,
      publishedAt: c.publishAt ?? c.createdAt,
      viewCount: c.viewCount,
      likeCount: c.likeCount,
      shareCount: c.shareCount,
      favoriteCount: c.favoriteCount,
      statsMode: c.statsMode,
      statsBase: c.statsBase,
      statsSalt: c.statsSalt,
      status: c.status,
    }))
  );
  const items: {
    contentId: number;
    slug: string;
    title: string;
    moduleType: string;
    categoryName: string;
    coverUrl: string | null;
    favoriteCount: number;
    favoritedAt: Date;
  }[] = [];
  for (const f of rows) {
    const c = byId.get(f.targetId);
    if (!c) continue; // 目标内容已被删除的残留收藏,列表中跳过
    const t = c.translations.find((x) => x.locale === locale) ?? c.translations[0];
    const cat =
      c.category.translations.find((x) => x.locale === locale) ?? c.category.translations[0];
    items.push({
      contentId: c.id,
      slug: c.slug,
      title: t?.title ?? c.slug,
      moduleType: c.category.moduleType,
      categoryName: cat?.name ?? c.category.slug,
      coverUrl: c.coverUrl,
      favoriteCount: display.get(c.id)?.favorites ?? c.favoriteCount,
      favoritedAt: f.createdAt,
    });
  }
  return items;
}

// —— 收藏 API 薄封装(自 src/app/api/interaction/favorite/route.ts 拆入) ——

const schema = z.object({ contentId: z.number().int() });

export interface FavoriteActor {
  userId: number;
}

/**
 * 登录墙薄封装(AC-021):无有效登录会话 → 401 jsonErr。
 * 独立为纯函数,便于在无 next/headers 请求作用域的 vitest(node)环境中
 * 直接验证 401 语义(TEST-008);POST 内部以 getActiveUserSession 的结果调用之。
 */
export function requireFavoriteActor(
  session: { id: number } | null | undefined
): { actor: FavoriteActor; error?: undefined } | { actor?: undefined; error: ReturnType<typeof jsonErr> } {
  if (!session || !session.id) return { error: jsonErr("请先登录", 401) };
  return { actor: { userId: session.id } };
}

/** 登录墙之后的切换处理(薄封装,测试可绕过 cookies() 直连) */
export async function postFavorite(actor: FavoriteActor, req: Request) {
  const parsed = await parseBody(req, schema);
  if (parsed.error) return parsed.error;
  try {
    const result = await toggleFavorite({
      contentId: parsed.data.contentId,
      userId: actor.userId,
    });
    // V4.8.0:回包用展示值(拟真层)+ 本次真实操作 —— 前台点一下正好 +1,不会跳回真实值
    const display = await resolveDisplayCountsById(parsed.data.contentId);
    return jsonOk(
      display ? { favorited: result.favorited, favoriteCount: display.favorites } : result
    );
  } catch (e) {
    if (e instanceof FavoriteTargetNotFoundError) return jsonErr(e.message, 404);
    return jsonErr(e instanceof Error ? e.message : "操作失败");
  }
}
