-- ============================================================
-- V4.2 媒体文件夹(二级)与素材归属:
--   MediaFolder    文件夹(name/parentId 二级:仅 null 或一级 id;应用层禁第三级)
--   MediaAsset.folderId 归属文件夹(NULL=未分类);删除文件夹要求先移空内容
-- ============================================================

CREATE TABLE "MediaFolder" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "parentId" INTEGER,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "MediaFolder_parentId_idx" ON "MediaFolder"("parentId");

ALTER TABLE "MediaAsset" ADD COLUMN "folderId" INTEGER;
CREATE INDEX "MediaAsset_folderId_idx" ON "MediaAsset"("folderId");
