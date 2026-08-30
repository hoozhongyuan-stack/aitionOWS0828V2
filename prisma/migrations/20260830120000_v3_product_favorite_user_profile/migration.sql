-- ============================================================
-- V3.0 迁移:商品图集/规格参数 + 收藏域 + 用户公司地区资料
-- 对应需求:REQ-001(gallery/specs)、REQ-005(Favorite/favoriteCount)、REQ-009(User 资料)
-- 策略:仅加列/建表,不改不动既有列;新列可空或带默认值,对存量数据无损;
--       可重复执行(prisma migrate deploy 幂等登记,不重复应用)。
-- 说明:Content 表带外键约束,prisma migrate diff 会生成重建式 SQL
--       (CREATE new_Content + INSERT..SELECT + DROP TABLE + RENAME),
--       与"仅加列/建表"决策冲突,故本迁移按 20260828010000_form_submission_status
--       先例手写纯增量 SQL;已用 migrate diff(--from-migrations 含本迁移)
--       校验与 schema.prisma 收敛为空差异(见 TASK-002-green.txt 证据)。
-- ============================================================

-- AlterTable:内容表增加商品图集与规格参数(JSON 字符串),及收藏计数
ALTER TABLE "Content" ADD COLUMN "gallery" TEXT;
ALTER TABLE "Content" ADD COLUMN "specs" TEXT;
ALTER TABLE "Content" ADD COLUMN "favoriteCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable:用户表增加公司/地区资料(后台用户管理维护,全部可空)
ALTER TABLE "User" ADD COLUMN "companyName" TEXT;
ALTER TABLE "User" ADD COLUMN "country" TEXT;
ALTER TABLE "User" ADD COLUMN "province" TEXT;
ALTER TABLE "User" ADD COLUMN "city" TEXT;

-- CreateTable:收藏记录(targetId 通用引用,无外键,应用层维护一致性;
-- 唯一约束兜底防重复,增删时由应用层同步 Content.favoriteCount)
CREATE TABLE "Favorite" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "targetType" TEXT NOT NULL DEFAULT 'CONTENT',
    "targetId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_targetType_targetId_userId_key" ON "Favorite"("targetType", "targetId", "userId");

-- CreateIndex
CREATE INDEX "Favorite_userId_idx" ON "Favorite"("userId");
