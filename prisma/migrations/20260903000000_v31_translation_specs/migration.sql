-- ============================================================
-- V3.1 迁移:规格表英文化(ContentTranslation.specs 多语言规格)
-- 对应需求:REQ-001/002(specs 按语言维护 + 存量回填)
-- 策略:仅加列 + 回填,不改不动既有列;新列可空,对存量数据无损;
--       可重复执行(prisma migrate deploy 幂等登记,不重复应用)。
-- 说明:ContentTranslation 表带外键与 (contentId, locale) 唯一约束,
--       prisma migrate diff 会生成重建式 SQL
--       (CREATE new_ContentTranslation + INSERT..SELECT + DROP TABLE + RENAME),
--       与"仅加列"决策冲突,故本迁移按 20260830120000_v3_product_favorite_user_profile
--       先例手写纯增量 SQL;已用 migrate diff(--from-migrations 含本迁移)
--       校验与 schema.prisma 收敛为空差异(见 TASK-101-green.txt 证据)。
-- ============================================================

-- AlterTable:翻译表增加规格参数(JSON 字符串,格式与 Content.specs 一致:
-- [{k,v}...] 有序键值对)。按语言独立维护;
-- 详情页兜底链=当前语言 translation.specs → Content.specs → 空表。
ALTER TABLE "ContentTranslation" ADD COLUMN "specs" TEXT;

-- 回填(REQ-002):每个翻译行 specs = 对应 Content.specs 的副本(原样 JSON 串);
-- 主表 specs 为 NULL 时相关函数为 NULL,UPDATE 天然写入 NULL,无需分支。
-- 一次性回填,重复执行亦无损(migrate deploy 登记机制保证不重复应用)。
UPDATE "ContentTranslation" SET "specs" = (
  SELECT "specs" FROM "Content" WHERE "Content"."id" = "ContentTranslation"."contentId"
);
