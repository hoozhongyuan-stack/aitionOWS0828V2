import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

/**
 * M-2 回归(级联清理):deleteContent 删除内容时,事务内清理该内容的 Favorite 行
 * (Favorite.targetId 无外键,应用层维护一致性);其他内容的收藏不受影响。
 */

let db: PrismaClient;
let deleteContent: typeof import("@/server/content")["deleteContent"];

let userId = 0;
let categoryId = 0;
let targetId = 0; // 被删除的内容
let otherId = 0; // 保留的内容

async function createPublishedContent(slug: string): Promise<number> {
  const c = await db.content.create({
    data: {
      slug,
      categoryId,
      status: "PUBLISHED",
      translations: { create: { locale: "zh", title: slug, body: "<p>x</p>" } },
    },
  });
  return c.id;
}

beforeAll(async () => {
  ({ prisma: db } = await import("@/lib/db"));
  ({ deleteContent } = await import("@/server/content"));

  const user = await db.user.create({
    data: { email: "del-fav@example.com", nickname: "级联用户", status: "ACTIVE" },
  });
  userId = user.id;
  const cat = await db.category.create({
    data: {
      slug: "del-fav-cat",
      moduleType: "news",
      translations: { create: { locale: "zh", name: "级联测试栏目" } },
    },
  });
  categoryId = cat.id;
  targetId = await createPublishedContent("del-fav-target");
  otherId = await createPublishedContent("del-fav-other");

  // 两条内容各有一条收藏,计数同步为 1
  await db.favorite.create({ data: { targetType: "CONTENT", targetId, userId } });
  await db.content.update({ where: { id: targetId }, data: { favoriteCount: 1 } });
  await db.favorite.create({ data: { targetType: "CONTENT", targetId: otherId, userId } });
  await db.content.update({ where: { id: otherId }, data: { favoriteCount: 1 } });
});

afterAll(async () => {
  await db.favorite.deleteMany({ where: { userId } });
  await db.content.deleteMany({ where: { categoryId } });
  await db.category.deleteMany({ where: { id: categoryId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});

describe("M-2: deleteContent 级联清理 Favorite", () => {
  it("删除内容后该内容的 Favorite 行消失;其他内容的收藏不受影响", async () => {
    // 基线:两条收藏都在
    expect(await db.favorite.count({ where: { targetId } })).toBe(1);
    expect(await db.favorite.count({ where: { targetId: otherId } })).toBe(1);

    await deleteContent(targetId);

    // 被删内容的收藏行已清理,内容行不存在
    expect(await db.favorite.count({ where: { targetType: "CONTENT", targetId } })).toBe(0);
    expect(await db.content.count({ where: { id: targetId } })).toBe(0);

    // 其他内容的收藏行与计数不受影响
    expect(await db.favorite.count({ where: { targetType: "CONTENT", targetId: otherId } })).toBe(
      1
    );
    const other = await db.content.findUnique({
      where: { id: otherId },
      select: { favoriteCount: true },
    });
    expect(other?.favoriteCount).toBe(1);
  });
});
