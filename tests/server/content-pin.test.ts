import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

/**
 * 内容置顶(V4.8.1)。
 * 锁住:置顶优先与时间倒序的组合、多条置顶的顺序、到期懒清理、草稿不生效、
 * 分页不重复、价格排序不置顶(B1)、单条切换往返。
 *
 * 注意:置顶是"全局可见"的状态,本文件的用例在 finally 里就地取消置顶,
 * afterAll 再兜底清一次,避免影响同进程内其他测试文件里的首页列表断言。
 */

let db: PrismaClient;
let content: typeof import("@/server/content");
let categoryId = 0;
const slugOf = (name: string) => `v481-pin-${name}`;

async function makeContent(name: string, publishDaysAgo: number, over: Record<string, unknown> = {}) {
  const publishAt = new Date();
  publishAt.setDate(publishAt.getDate() - publishDaysAgo);
  publishAt.setHours(10, 0, 0, 0);
  return db.content.create({
    data: {
      slug: slugOf(name),
      categoryId,
      status: "PUBLISHED",
      authorName: "置顶测试",
      publishAt,
      translations: { create: { locale: "zh-CN", title: slugOf(name), body: "<p>x</p>" } },
      ...over,
    },
  });
}

/** 取消所有置顶(就地清理,避免污染其他测试文件) */
async function clearAllPins() {
  await db.content.updateMany({
    where: { pinnedAt: { not: null } },
    data: { pinnedAt: null, pinExpiresAt: null },
  });
}

beforeAll(async () => {
  content = await import("@/server/content");
  db = (await import("@/lib/db")).prisma;
  const cat = await db.category.create({
    data: {
      slug: "v481-pin-cat",
      moduleType: "article",
      visible: true,
      sort: 1,
      translations: { create: { locale: "zh-CN", name: "置顶测试栏目" } },
    },
  });
  categoryId = cat.id;
});

afterAll(async () => {
  await clearAllPins();
});

describe("栏目页列表:置顶优先", () => {
  it("置顶的老文排在未置顶的新文之前;取消置顶后回到时间序", async () => {
    const fresh = await makeContent("old-vs-new-new", 1);
    const old = await makeContent("old-vs-new-old", 20);

    const before = await content.listPublishedByCategory("v481-pin-cat", "zh-CN", 1, 50);
    expect(before!.items[0].id).toBe(fresh.id); // 时间序:新文在前

    await content.setContentPin({ id: old.id, pinned: true });
    try {
      const pinned = await content.listPublishedByCategory("v481-pin-cat", "zh-CN", 1, 50);
      expect(pinned!.items[0].id).toBe(old.id);
      expect(pinned!.items[0].pinned).toBe(true); // 卡片拿得到徽标标记
      expect(pinned!.items[1].id).toBe(fresh.id);
    } finally {
      await content.setContentPin({ id: old.id, pinned: false });
    }

    const after = await content.listPublishedByCategory("v481-pin-cat", "zh-CN", 1, 50);
    expect(after!.items[0].id).toBe(fresh.id);
    expect(after!.items[0].pinned).toBe(false);
  });

  it("多条置顶:按置顶时间倒序(最近置顶的排最前)", async () => {
    const a = await makeContent("multi-a", 10);
    const b = await makeContent("multi-b", 5);
    const c = await makeContent("multi-c", 1);
    await content.setContentPin({ id: a.id, pinned: true });
    await new Promise((r) => setTimeout(r, 15)); // 拉开置顶时刻
    await content.setContentPin({ id: b.id, pinned: true });
    try {
      const list = await content.listPublishedByCategory("v481-pin-cat", "zh-CN", 1, 50);
      const ids = list!.items.map((i) => i.id);
      expect(ids[0]).toBe(b.id); // 后置顶的在前
      expect(ids[1]).toBe(a.id);
      expect(ids[2]).toBe(c.id); // 未置顶的按时间序在后
    } finally {
      await clearAllPins();
    }
  });

  it("价格排序时不置顶优先(B1:此刻用户在比价)", async () => {
    const pinned = await makeContent("price-pinned", 20, { priceCents: 9999 });
    const cheap = await makeContent("price-cheap", 1, { priceCents: 100 });
    await content.setContentPin({ id: pinned.id, pinned: true });
    try {
      const list = await content.listPublishedByCategory("v481-pin-cat", "zh-CN", 1, 50, {
        sort: "priceAsc",
      });
      const ids = list!.items.map((i) => i.id);
      // 置顶没有插队;有价的两条按价格升序(无价内容 priceCents=NULL,SQLite ASC 时本就排最前)
      expect(ids[0]).not.toBe(pinned.id);
      expect(ids.indexOf(cheap.id)).toBeLessThan(ids.indexOf(pinned.id));
    } finally {
      await clearAllPins();
    }
  });

  it("分页:置顶项固定出现在第 1 页,第 2 页不重复", async () => {
    const pinned = await makeContent("page-pinned", 30);
    await content.setContentPin({ id: pinned.id, pinned: true });
    try {
      const p1 = await content.listPublishedByCategory("v481-pin-cat", "zh-CN", 1, 2);
      const p2 = await content.listPublishedByCategory("v481-pin-cat", "zh-CN", 2, 2);
      expect(p1!.items[0].id).toBe(pinned.id);
      expect(p2!.items.map((i) => i.id)).not.toContain(pinned.id);
    } finally {
      await clearAllPins();
    }
  });

  it("草稿/下架的置顶不生效(前台列表里根本不出现)", async () => {
    const draft = await makeContent("draft-pinned", 3, { status: "DRAFT" });
    await content.setContentPin({ id: draft.id, pinned: true });
    try {
      const list = await content.listPublishedByCategory("v481-pin-cat", "zh-CN", 1, 50);
      expect(list!.items.map((i) => i.id)).not.toContain(draft.id);
    } finally {
      await clearAllPins();
    }
  });
});

describe("首页「最新动态」:置顶优先", () => {
  it("置顶内容排在列表首位", async () => {
    const pinned = await makeContent("home-pinned", 30);
    await content.setContentPin({ id: pinned.id, pinned: true });
    try {
      const items = await content.listLatestPublished("zh-CN", 6);
      expect(items[0].id).toBe(pinned.id);
      expect(items[0].pinned).toBe(true);
    } finally {
      await clearAllPins();
    }
  });
});

describe("到期自动失效(懒清理)", () => {
  it("已过期的置顶不再排前,且库里字段被清空", async () => {
    const expired = await makeContent("expired", 20);
    // 置顶但到期时刻在过去
    await content.setContentPin({
      id: expired.id,
      pinned: true,
      expiresAt: new Date(Date.now() - 60_000),
    });
    const list = await content.listPublishedByCategory("v481-pin-cat", "zh-CN", 1, 50);
    expect(list!.items[0].id).not.toBe(expired.id); // 没有抢到首位

    const row = await db.content.findUnique({ where: { id: expired.id } });
    expect(row?.pinnedAt).toBeNull(); // 懒清理把标记摘掉了
    expect(row?.pinExpiresAt).toBeNull();
  });

  it("未到期的置顶不被误清", async () => {
    const alive = await makeContent("not-expired", 20);
    await content.setContentPin({
      id: alive.id,
      pinned: true,
      expiresAt: new Date(Date.now() + 3600_000),
    });
    try {
      await content.clearExpiredPins();
      const row = await db.content.findUnique({ where: { id: alive.id } });
      expect(row?.pinnedAt).not.toBeNull();
      const list = await content.listPublishedByCategory("v481-pin-cat", "zh-CN", 1, 50);
      expect(list!.items[0].id).toBe(alive.id);
    } finally {
      await clearAllPins();
    }
  });

  it("永久置顶(到期时间为空)长期有效", async () => {
    const forever = await makeContent("forever", 20);
    await content.setContentPin({ id: forever.id, pinned: true, expiresAt: null });
    try {
      await content.clearExpiredPins();
      const row = await db.content.findUnique({ where: { id: forever.id } });
      expect(row?.pinnedAt).not.toBeNull();
      expect(row?.pinExpiresAt).toBeNull();
    } finally {
      await clearAllPins();
    }
  });
});

describe("单条切换与后台列表计数", () => {
  it("setContentPin 往返:置顶 → 取消(到期时间一并清空)", async () => {
    const c = await makeContent("toggle", 3);
    const on = await content.setContentPin({
      id: c.id,
      pinned: true,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    expect(on.pinned).toBe(true);
    expect(on.pinExpiresAt).not.toBeNull();

    const off = await content.setContentPin({ id: c.id, pinned: false });
    expect(off.pinned).toBe(false);
    expect(off.pinExpiresAt).toBeNull();
  });

  it("后台列表返回置顶篇数(顶部提示用)", async () => {
    const a = await makeContent("count-a", 3);
    await content.setContentPin({ id: a.id, pinned: true });
    try {
      const list = await content.listContentsAdmin({ page: 1, pageSize: 5 });
      expect(list.pinnedCount).toBeGreaterThanOrEqual(1);
    } finally {
      await clearAllPins();
    }
  });
});
