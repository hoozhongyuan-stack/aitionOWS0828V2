-- DropIndex
DROP INDEX "AICrawlEvent_kind_ts_idx";

-- DropIndex
DROP INDEX "AICrawlStat_kind_date_idx";

-- DropIndex
DROP INDEX "AIReferralEvent_kind_ts_idx";

-- DropIndex
DROP INDEX "AIReferralStat_kind_date_idx";

-- DropIndex
DROP INDEX "MediaAsset_folderId_idx";

-- DropIndex
DROP INDEX "MediaFolder_parentId_idx";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AdminUser" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "role" TEXT NOT NULL DEFAULT 'OWNER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "permissions" TEXT,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_AdminUser" ("createdAt", "displayName", "id", "lastLoginAt", "passwordHash", "permissions", "role", "status", "username") SELECT "createdAt", "displayName", "id", "lastLoginAt", "passwordHash", "permissions", "role", "status", "username" FROM "AdminUser";
DROP TABLE "AdminUser";
ALTER TABLE "new_AdminUser" RENAME TO "AdminUser";
CREATE UNIQUE INDEX "AdminUser_username_key" ON "AdminUser"("username");
CREATE TABLE "new_Comment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "contentId" INTEGER NOT NULL,
    "userId" INTEGER,
    "guestName" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "parentId" INTEGER,
    "isAuthorReply" BOOLEAN NOT NULL DEFAULT false,
    "ip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Comment_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Comment" ("body", "contentId", "createdAt", "guestName", "id", "ip", "status", "userId") SELECT "body", "contentId", "createdAt", "guestName", "id", "ip", "status", "userId" FROM "Comment";
DROP TABLE "Comment";
ALTER TABLE "new_Comment" RENAME TO "Comment";
CREATE INDEX "Comment_contentId_status_idx" ON "Comment"("contentId", "status");
CREATE INDEX "Comment_status_idx" ON "Comment"("status");
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
