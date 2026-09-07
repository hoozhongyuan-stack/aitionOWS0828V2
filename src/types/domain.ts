import { z } from "zod";

/**
 * 领域状态常量(唯一权威定义)。
 * 背景:SQLite 连接器不支持 Prisma enum,数据库以 String 存储,
 *       合法值由此文件 + zod 在应用层强约束。
 * 约定:任何写库前必须经对应 zod schema 校验;禁止散落魔法字符串。
 */

// —— 内容状态 ——
export const CONTENT_STATUS = {
  DRAFT: "DRAFT", // 草稿
  PUBLISHED: "PUBLISHED", // 已发布
  OFFLINE: "OFFLINE", // 已下架
  SCHEDULED: "SCHEDULED", // 定时发布(待到点)
  PENDING: "PENDING", // 待审核(用户投稿)
  REJECTED: "REJECTED", // 审核驳回
} as const;
export type ContentStatus = (typeof CONTENT_STATUS)[keyof typeof CONTENT_STATUS];
export const contentStatusSchema = z.nativeEnum(CONTENT_STATUS);

// —— 内容来源 ——
export const CONTENT_SOURCE = {
  ADMIN: "ADMIN", // 后台发布
  UGC: "UGC", // 用户投稿
} as const;
export type ContentSource = (typeof CONTENT_SOURCE)[keyof typeof CONTENT_SOURCE];
export const contentSourceSchema = z.nativeEnum(CONTENT_SOURCE);

// —— 评论状态 ——
export const COMMENT_STATUS = {
  PENDING: "PENDING", // 待审核
  APPROVED: "APPROVED", // 已通过
  REJECTED: "REJECTED", // 已驳回
} as const;
export type CommentStatus = (typeof COMMENT_STATUS)[keyof typeof COMMENT_STATUS];
export const commentStatusSchema = z.nativeEnum(COMMENT_STATUS);

// —— 用户状态 ——
export const USER_STATUS = {
  ACTIVE: "ACTIVE", // 正常
  DISABLED: "DISABLED", // 禁用
} as const;
export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];
export const userStatusSchema = z.nativeEnum(USER_STATUS);

// —— 互动目标类型 ——
export const TARGET_TYPE = {
  CONTENT: "CONTENT", // 内容(可扩展:产品、页面等)
} as const;
export type TargetType = (typeof TARGET_TYPE)[keyof typeof TARGET_TYPE];
export const targetTypeSchema = z.nativeEnum(TARGET_TYPE);

// —— 协议类型 ——
export const AGREEMENT_TYPE = {
  REGISTER: "REGISTER", // 用户注册协议
  PRIVACY: "PRIVACY", // 隐私政策
  COOKIES: "COOKIES", // Cookie 政策(V4.0 GDPR)
} as const;
export type AgreementType = (typeof AGREEMENT_TYPE)[keyof typeof AGREEMENT_TYPE];
export const agreementTypeSchema = z.nativeEnum(AGREEMENT_TYPE);
