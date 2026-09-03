-- ============================================================
-- V3.1 回滚 SQL:删除 ContentTranslation.specs
-- 逆迁移:prisma/migrations/20260903000000_v31_translation_specs/migration.sql
-- 执行前置:先停 app(沿用 pre-v3x 停机窗口模式),建议先做数据库备份。
-- 说明:SQLite DROP COLUMN 直接丢弃该列数据(翻译行各语言 specs 不可恢复,
--       Content.specs 兜底列不受影响);代码侧需同步 git revert 服务层改动。
-- ============================================================

ALTER TABLE "ContentTranslation" DROP COLUMN "specs";
