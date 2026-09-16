import { prisma } from "@/lib/db";
import { COMMENT_STATUS, TARGET_TYPE, CONTENT_STATUS } from "@/types/domain";
import { findSensitiveWord, invalidateWordsCache } from "@/lib/ugc/filter";
import { sanitizeRichHtml } from "@/lib/sanitize";

/**
 * UGC 服务(需求 4.8):阅读/点赞/转发计数、评论全流程、敏感词管理。
 * 铁律:任何 UGC 默认 PENDING,绝无自动上线分支。
 *
 * 收藏域(V3.0 REQ-005)已拆分至 ./favorite(独立可测量模块,NFR-005 覆盖率口径);
 * 此处显式 re-export 保持既有导入路径(@/server/ugc)不变。
 */
export {
  toggleFavorite,
  hasFavorited,
  listMyFavorites,
  FavoriteTargetNotFoundError,
} from "./favorite";

// ---------------- 阅读量 ----------------

export async function increaseView(contentId: number): Promise<void> {
  await prisma.content.updateMany({
    where: { id: contentId, status: CONTENT_STATUS.PUBLISHED },
    data: { viewCount: { increment: 1 } },
  });
}

// ---------------- 点赞 ----------------

/** 点赞/取消点赞;返回最新计数与状态 */
export async function toggleLike(input: {
  contentId: number;
  userId?: number | null;
  guestKey?: string | null;
}): Promise<{ liked: boolean; likeCount: number }> {
  const { contentId } = input;
  const who = input.userId
    ? { userId: input.userId, guestKey: null }
    : { userId: null, guestKey: input.guestKey ?? null };
  if (!who.userId && !who.guestKey) throw new Error("无法识别点赞者");

  const existing = await prisma.like.findFirst({
    where: { targetType: TARGET_TYPE.CONTENT, targetId: contentId, ...who },
  });

  if (existing) {
    await prisma.like.delete({ where: { id: existing.id } });
    await prisma.content.updateMany({
      where: { id: contentId, likeCount: { gt: 0 } },
      data: { likeCount: { decrement: 1 } },
    });
  } else {
    try {
      await prisma.like.create({
        data: { targetType: TARGET_TYPE.CONTENT, targetId: contentId, ...who },
      });
      await prisma.content.update({ where: { id: contentId }, data: { likeCount: { increment: 1 } } });
    } catch {
      // 唯一约束并发冲突 → 视为已点赞
    }
  }

  const [content, likedRow] = await Promise.all([
    prisma.content.findUnique({ where: { id: contentId }, select: { likeCount: true } }),
    prisma.like.findFirst({ where: { targetType: TARGET_TYPE.CONTENT, targetId: contentId, ...who } }),
  ]);
  return { liked: !!likedRow, likeCount: content?.likeCount ?? 0 };
}

/** 查询是否已点赞 */
export async function hasLiked(input: {
  contentId: number;
  userId?: number | null;
  guestKey?: string | null;
}): Promise<boolean> {
  const who = input.userId
    ? { userId: input.userId, guestKey: null }
    : { userId: null, guestKey: input.guestKey ?? null };
  if (!who.userId && !who.guestKey) return false;
  const row = await prisma.like.findFirst({
    where: { targetType: TARGET_TYPE.CONTENT, targetId: input.contentId, ...who },
  });
  return !!row;
}

// ---------------- 转发 ----------------

export async function recordShare(contentId: number, ip: string | null): Promise<number> {
  await prisma.shareLog.create({
    data: { targetType: TARGET_TYPE.CONTENT, targetId: contentId, ip },
  });
  const content = await prisma.content.update({
    where: { id: contentId },
    data: { shareCount: { increment: 1 } },
    select: { shareCount: true },
  });
  return content.shareCount;
}

// ---------------- 评论 ----------------

/** 前台:已审核评论列表 */
export interface CommentView {
  id: number;
  body: string;
  createdAt: Date;
  author: string;
  isAuthorReply: boolean;
  replies: { id: number; body: string; createdAt: Date; author: string; isAuthorReply: boolean }[];
}

/**
 * 已通过评论,两层结构(V4.7.4):回复(parentId 非空)一律归拢到其**顶层祖先**下。
 * 现阶段只有后台能回复,深度最多两层;归拢保证未来即使出现"回复的回复",
 * 前台也不会出现楼中楼(目标评论本身是回复时,挂到它所属的顶层下)。
 */
export async function listApprovedComments(contentId: number): Promise<CommentView[]> {
  const rows = await prisma.comment.findMany({
    where: { contentId, status: COMMENT_STATUS.APPROVED },
    orderBy: { id: "desc" },
    include: { user: { select: { nickname: true, email: true } } },
  });
  const author = (r: (typeof rows)[number]) =>
    r.user?.nickname || r.user?.email?.split("@")[0] || r.guestName || "游客";
  const byId = new Map(rows.map((r) => [r.id, r]));
  const rootOf = (r: (typeof rows)[number]): (typeof rows)[number] => {
    let cur = r;
    while (cur.parentId != null) {
      const p = byId.get(cur.parentId);
      if (!p) break;
      cur = p;
    }
    return cur;
  };

  const tops = new Map<number, CommentView>();
  for (const r of rows) {
    if (r.parentId == null) {
      tops.set(r.id, {
        id: r.id, body: r.body, createdAt: r.createdAt, author: author(r),
        isAuthorReply: r.isAuthorReply, replies: [],
      });
    }
  }
  for (const r of rows) {
    if (r.parentId == null) continue;
    const root = rootOf(r);
    const top = tops.get(root.id);
    if (!top) continue; // 顶层被删/未通过:其回复随之上屏消失(语义一致)
    top.replies.push({
      id: r.id, body: r.body, createdAt: r.createdAt, author: author(r),
      isAuthorReply: r.isAuthorReply,
    });
  }
  const list = [...tops.values()].sort((a, b) => b.id - a.id);
  for (const t of list) t.replies.sort((a, b) => a.id - b.id); // 对话内旧→新
  return list;
}

/** 提交评论:敏感词拦截 → 入库 PENDING(绝不直接可见) */
export async function submitComment(input: {
  contentId: number;
  body: string;
  userId?: number | null;
  guestName?: string | null;
  ip?: string | null;
}) {
  const body = input.body.trim();
  if (!body) throw new Error("评论内容不能为空");
  if (body.length > 1000) throw new Error("评论过长(最多 1000 字)");

  const hit = await findSensitiveWord(body + " " + (input.guestName ?? ""));
  if (hit) throw new Error("内容包含敏感词,请修改后再提交");

  const content = await prisma.content.findUnique({ where: { id: input.contentId } });
  if (!content || content.status !== CONTENT_STATUS.PUBLISHED) throw new Error("内容不存在");

  await prisma.comment.create({
    data: {
      contentId: input.contentId,
      userId: input.userId ?? null,
      guestName: input.userId ? null : input.guestName?.trim() || null,
      body,
      status: COMMENT_STATUS.PENDING, // 铁律:默认待审核
      ip: input.ip ?? null,
    },
  });
}

/** 后台:评论列表(按状态) */
/** 创建时间范围筛选条件(测试反馈新增需求④),ISO 日期字符串,闭区间 */
function createdAtRange(dateFrom?: string, dateTo?: string) {
  if (!dateFrom && !dateTo) return undefined;
  return {
    ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00`) } : {}),
    ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999`) } : {}),
  };
}

export async function listCommentsAdmin(
  status: string | undefined,
  page = 1,
  pageSize = 20,
  dateFrom?: string,
  dateTo?: string
) {
  const createdAt = createdAtRange(dateFrom, dateTo);
  const where = { ...(status ? { status } : {}), ...(createdAt ? { createdAt } : {}) };
  const [total, items] = await Promise.all([
    prisma.comment.count({ where }),
    prisma.comment.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { nickname: true, email: true } },
        content: { select: { slug: true, translations: { select: { locale: true, title: true } } } },
      },
    }),
  ]);
  return { total, page, pageSize, items };
}

/** 后台:审核评论(通过/驳回) */
export async function reviewComment(id: number, status: string) {
  if (status !== COMMENT_STATUS.APPROVED && status !== COMMENT_STATUS.REJECTED) {
    throw new Error("非法的审核状态");
  }
  await prisma.comment.update({ where: { id }, data: { status } });
}

/** 后台作者回复(V4.7.4):以站点名落一条 APPROVED 评论,挂到目标评论下。
 *  不查敏感词、不受投稿开关限制 —— 站长对自己的站点内容回复。 */
export async function replyAsAuthor(input: { commentId: number; body: string; siteName: string }) {
  const body = input.body.trim();
  if (!body) throw new Error("回复内容不能为空");
  if (body.length > 1000) throw new Error("回复过长(最多 1000 字)");
  const parent = await prisma.comment.findUnique({ where: { id: input.commentId } });
  if (!parent) throw new Error("目标评论不存在");
  return prisma.comment.create({
    data: {
      contentId: parent.contentId,
      parentId: parent.parentId ?? parent.id, // 目标本身是回复时,仍挂到同一顶层下
      isAuthorReply: true,
      guestName: input.siteName,
      body,
      status: COMMENT_STATUS.APPROVED,
    },
  });
}

export async function deleteComment(id: number) {
  // 先删回复再删本体(FK 级联也会兜底,显式删除语义更清晰)
  await prisma.comment.deleteMany({ where: { parentId: id } });
  await prisma.comment.delete({ where: { id } });
}

// ---------------- 用户投稿(需求 4.8) ----------------

import { CONTENT_SOURCE } from "@/types/domain";
import { notifyAdmin } from "@/server/notify";
import { renderUgcPendingNotify } from "@/server/notify/template";
import { routing } from "@/i18n/routing";

/**
 * 用户投稿:入库为 Content(source=UGC, status=PENDING)。
 * 前置校验:投稿总开关、栏目允许投稿、敏感词。绝无自动上线。
 */
export async function submitUserContent(input: {
  userId: number;
  categoryId: number;
  locale: string;
  title: string;
  summary: string | null;
  body: string;
  coverUrl: string | null;
}) {
  const title = input.title.trim();
  if (!title) throw new Error("请输入标题");
  if (title.length > 120) throw new Error("标题过长");
  // 投稿正文是不可信输入(接口可被直连调用),入库前按白名单消毒防存储型 XSS
  const body = sanitizeRichHtml(input.body);
  if (!body || body.length < 10) throw new Error("正文内容过短");
  if (body.length > 100_000) throw new Error("正文过长");

  const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
  if (!category || !category.allowSubmit || !category.visible) {
    throw new Error("该栏目不接受投稿");
  }

  // 作者显示名直接采用投稿用户名称(昵称 → 邮箱前缀兜底),无需投稿人填写
  const author = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { nickname: true, email: true },
  });
  const authorName = author?.nickname?.trim() || author?.email?.split("@")[0] || "用户";

  // 敏感词(标题+摘要+正文纯文本粗检)
  const textBlob = `${title} ${input.summary ?? ""} ${body.replace(/<[^>]+>/g, " ")}`;
  const hit = await findSensitiveWord(textBlob);
  if (hit) throw new Error("内容包含敏感词,请修改后再提交");

  const slug = `ugc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const content = await prisma.content.create({
    data: {
      slug,
      categoryId: input.categoryId,
      status: CONTENT_STATUS.PENDING, // 铁律:待审核
      source: CONTENT_SOURCE.UGC,
      authorUserId: input.userId,
      authorName,
      coverUrl: input.coverUrl,
    },
  });
  await prisma.contentTranslation.create({
    data: {
      contentId: content.id,
      locale: input.locale,
      title,
      summary: input.summary,
      body,
    },
  });

  // 管理员邮件通知(REQ-012 品牌模板):不 await,失败也不影响用户投稿;
  // html 传渲染 Promise → notifyAdmin 在静默门禁内等待,开关/静默语义与原 notifyAdminBranded 等价
  void notifyAdmin(`[AitionOWS] 收到新的用户投稿:${title}`, [], renderUgcPendingNotify({
    kind: "submission",
    title,
    author: authorName,
    // 后台「互动审核 → 投稿审核」页(绝对 URL);管理端语言固定为编译期默认语言(与表单调用点口径一致)
    adminUrl: `${(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "")}/${routing.defaultLocale}/admin/ugc`,
  }));

  return content;
}

/** 我的投稿列表(状态可见) */
export async function listMySubmissions(userId: number) {
  const rows = await prisma.content.findMany({
    where: { source: CONTENT_SOURCE.UGC, authorUserId: userId },
    orderBy: { id: "desc" },
    include: { translations: true, category: { include: { translations: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    status: r.status,
    createdAt: r.createdAt,
    title: r.translations[0]?.title ?? "",
    category: r.category.translations[0]?.name ?? r.category.slug,
  }));
}

/** 后台:投稿审核列表 */
export async function listSubmissionsAdmin(
  status: string | undefined,
  page = 1,
  pageSize = 20,
  dateFrom?: string,
  dateTo?: string
) {
  const createdAt = createdAtRange(dateFrom, dateTo);
  const where = {
    source: CONTENT_SOURCE.UGC,
    ...(status ? { status } : {}),
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
  // 关联投稿人昵称
  const userIds = [...new Set(items.map((i) => i.authorUserId).filter((v): v is number => v != null))];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nickname: true, email: true } })
    : [];
  const userById = new Map(users.map((u) => [u.id, u.nickname || u.email || `用户${u.id}`]));
  return {
    total,
    page,
    pageSize,
    items: items.map((i) => ({ ...i, authorName: i.authorUserId ? (userById.get(i.authorUserId) ?? "-") : "-" })),
  };
}

/** 后台:审核投稿(通过 → 直接发布;驳回 → REJECTED) */
export async function reviewSubmission(id: number, approve: boolean) {
  const content = await prisma.content.findUnique({ where: { id } });
  if (!content || content.source !== CONTENT_SOURCE.UGC) throw new Error("投稿不存在");
  await prisma.content.update({
    where: { id },
    data: { status: approve ? CONTENT_STATUS.PUBLISHED : CONTENT_STATUS.REJECTED, publishAt: approve ? new Date() : null },
  });
}

// ---------------- 敏感词管理 ----------------

export async function listWords() {
  return prisma.sensitiveWord.findMany({ orderBy: { id: "desc" } });
}

export async function addWords(words: string[]) {
  for (const word of words.map((w) => w.trim()).filter(Boolean)) {
    await prisma.sensitiveWord.upsert({ where: { word }, update: {}, create: { word } });
  }
  invalidateWordsCache();
}

export async function removeWord(id: number) {
  await prisma.sensitiveWord.delete({ where: { id } });
  invalidateWordsCache();
}
