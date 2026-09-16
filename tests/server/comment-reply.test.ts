import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * 评论两层回复(V4.7.4):后台作者回复 → 两层列表归拢 → 删除连带。
 * 锁住:回复挂到目标评论(目标本身是回复时归拢到同一顶层)、作者回复直发 APPROVED、
 * 删除父评论连带回复、前台列表只含 APPROVED。
 */

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...actual,
    requireAdmin: async () => ({ admin: { id: 1, name: "tester" } }),
    requireOwner: async () => ({ admin: { id: 1, name: "tester", role: "OWNER", permissions: [] } }),
    requirePerm: async () => ({ admin: { id: 1, name: "tester", role: "OWNER", permissions: [] } }),
  };
});

let prisma: typeof import("@/lib/db")["prisma"];
let ugc: typeof import("@/server/ugc");

let contentId: number;
let topLevelId: number;
let replyId: number;

beforeAll(async () => {
  ({ prisma } = await import("@/lib/db"));
  ugc = await import("@/server/ugc");

  const cat = await prisma.category.create({
    data: {
      slug: "v474-comment-cat",
      moduleType: "article",
      visible: true,
      translations: { create: { locale: "zh-CN", name: "回复测试栏目" } },
    },
  });
  const content = await prisma.content.create({
    data: {
      slug: "v474-comment-article",
      categoryId: cat.id,
      status: "PUBLISHED",
      authorName: "回复测试",
      translations: { create: { locale: "zh-CN", title: "回复测试文章", body: "<p>x</p>" } },
    },
  });
  contentId = content.id;

  // 访客顶层评论(APPROVED)+ 一条待审核(不应出现在前台列表)
  topLevelId = (
    await prisma.comment.create({
      data: { contentId, guestName: "访客甲", body: "顶层评论", status: "APPROVED" },
    })
  ).id;
  await prisma.comment.create({
    data: { contentId, guestName: "访客乙", body: "待审核不可见", status: "PENDING" },
  });
  // 作者回复(挂在顶层下)
  const reply = await ugc.replyAsAuthor({ commentId: topLevelId, body: "作者回复", siteName: "数字中圆" });
  replyId = reply.id;
  // 对回复再回复(应归拢到同一顶层)
  await ugc.replyAsAuthor({ commentId: replyId, body: "再回复", siteName: "数字中圆" });
});

describe("replyAsAuthor 作者回复(V4.7.4)", () => {
  it("回复直发 APPROVED,带 isAuthorReply 与站点名,挂到目标评论下", async () => {
    const reply = await prisma.comment.findUniqueOrThrow({ where: { id: replyId } });
    expect(reply.status).toBe("APPROVED");
    expect(reply.isAuthorReply).toBe(true);
    expect(reply.guestName).toBe("数字中圆");
    expect(reply.parentId).toBe(topLevelId);
  });

  it("对回复再回复 → parentId 归拢到同一顶层(保持两层)", async () => {
    const second = await prisma.comment.findFirstOrThrow({ where: { body: "再回复" } });
    expect(second.parentId).toBe(topLevelId);
  });

  it("空内容/超长被拒", async () => {
    await expect(ugc.replyAsAuthor({ commentId: topLevelId, body: "   ", siteName: "x" })).rejects.toThrow();
    await expect(
      ugc.replyAsAuthor({ commentId: topLevelId, body: "x".repeat(1001), siteName: "x" })
    ).rejects.toThrow();
  });
});

describe("listApprovedComments 两层结构(V4.7.4)", () => {
  it("回复归拢到顶层下;待审核不出现在任何层级", async () => {
    const list = await ugc.listApprovedComments(contentId);
    expect(list).toHaveLength(1);
    const top = list[0];
    expect(top.id).toBe(topLevelId);
    expect(top.replies).toHaveLength(2);
    expect(top.replies.map((r) => r.body)).toEqual(["作者回复", "再回复"]); // 旧→新
    expect(top.replies.every((r) => r.isAuthorReply)).toBe(true);
    const all = JSON.stringify(list);
    expect(all).not.toContain("待审核不可见");
  });

  it("删除父评论连带删除其下回复", async () => {
    const tmpTop = await prisma.comment.create({
      data: { contentId, guestName: "临时", body: "临时顶层", status: "APPROVED" },
    });
    await ugc.replyAsAuthor({ commentId: tmpTop.id, body: "临时回复", siteName: "数字中圆" });
    await ugc.deleteComment(tmpTop.id);
    const left = await prisma.comment.findMany({ where: { parentId: tmpTop.id } });
    expect(left).toHaveLength(0);
    expect(await prisma.comment.findUnique({ where: { id: tmpTop.id } })).toBeNull();
  });
});
