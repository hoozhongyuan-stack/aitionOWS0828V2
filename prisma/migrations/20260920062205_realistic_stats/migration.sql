-- CreateTable
CREATE TABLE "ContentDailyView" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "contentId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContentDailyView_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Content" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "slug" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "source" TEXT NOT NULL DEFAULT 'ADMIN',
    "coverUrl" TEXT,
    "gallery" TEXT,
    "specs" TEXT,
    "authorUserId" INTEGER,
    "authorName" TEXT,
    "formId" INTEGER,
    "publishAt" DATETIME,
    "priceCents" INTEGER,
    "currency" TEXT,
    "spu" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "shareCount" INTEGER NOT NULL DEFAULT 0,
    "favoriteCount" INTEGER NOT NULL DEFAULT 0,
    "statsMode" TEXT NOT NULL DEFAULT 'AUTO',
    "statsBase" INTEGER,
    "statsSalt" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Content_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Content" ("authorName", "authorUserId", "categoryId", "coverUrl", "createdAt", "currency", "favoriteCount", "formId", "gallery", "id", "likeCount", "priceCents", "publishAt", "shareCount", "slug", "source", "specs", "spu", "status", "updatedAt", "viewCount") SELECT "authorName", "authorUserId", "categoryId", "coverUrl", "createdAt", "currency", "favoriteCount", "formId", "gallery", "id", "likeCount", "priceCents", "publishAt", "shareCount", "slug", "source", "specs", "spu", "status", "updatedAt", "viewCount" FROM "Content";
DROP TABLE "Content";
ALTER TABLE "new_Content" RENAME TO "Content";
CREATE UNIQUE INDEX "Content_slug_key" ON "Content"("slug");
CREATE INDEX "Content_categoryId_status_idx" ON "Content"("categoryId", "status");
CREATE INDEX "Content_status_publishAt_idx" ON "Content"("status", "publishAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ContentDailyView_contentId_idx" ON "ContentDailyView"("contentId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentDailyView_contentId_date_key" ON "ContentDailyView"("contentId", "date");
