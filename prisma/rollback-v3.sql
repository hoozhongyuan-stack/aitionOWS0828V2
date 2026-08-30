-- ============================================================
-- V3.0 迁移回滚脚本
-- 回滚目标:20260830120000_v3_product_favorite_user_profile
-- 注意事项(务必先读):
--   1. 需 SQLite >= 3.35(2021-03-12)支持 ALTER TABLE ... DROP COLUMN;
--   2. 执行前必须完整备份数据库(data/app.db 及 -wal/-shm 一并复制),
--      可参照 backups/pre-v3-migration/ 的备份方式;
--   3. 本脚本仅回滚 V3.0 数据库结构,回滚后 v3 应用代码(收藏/商品图集/
--      用户资料编辑)不可再访问这些列,应一并回退部署;
--   4. 回滚将永久删除 Favorite 表数据与 Content.gallery/specs/favoriteCount、
--      User.companyName/country/province/city 列数据,不可恢复(除备份外)。
-- ============================================================

-- 收藏表:整表删除
DROP TABLE IF EXISTS "Favorite";

-- 内容表:移除图集/规格参数/收藏计数
ALTER TABLE "Content" DROP COLUMN "gallery";
ALTER TABLE "Content" DROP COLUMN "specs";
ALTER TABLE "Content" DROP COLUMN "favoriteCount";

-- 用户表:移除公司/地区资料
ALTER TABLE "User" DROP COLUMN "companyName";
ALTER TABLE "User" DROP COLUMN "country";
ALTER TABLE "User" DROP COLUMN "province";
ALTER TABLE "User" DROP COLUMN "city";
