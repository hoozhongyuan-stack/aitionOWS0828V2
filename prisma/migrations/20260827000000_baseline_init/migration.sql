-- CreateTable
CREATE TABLE "Setting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "group" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Locale" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "UiTranslation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "locale" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Agreement" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SeoMeta" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pageKey" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "keywords" TEXT NOT NULL,
    "description" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Category" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "slug" TEXT NOT NULL,
    "parentId" INTEGER,
    "moduleType" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "externalUrl" TEXT,
    "allowSubmit" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CategoryTranslation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "categoryId" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    CONSTRAINT "CategoryTranslation_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NavItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "parentId" INTEGER,
    "categoryId" INTEGER,
    "label" TEXT NOT NULL,
    "labelI18n" TEXT,
    "url" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "target" TEXT NOT NULL DEFAULT '_self'
);

-- CreateTable
CREATE TABLE "Banner" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "imageUrl" TEXT NOT NULL,
    "linkUrl" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Content" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "slug" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "source" TEXT NOT NULL DEFAULT 'ADMIN',
    "coverUrl" TEXT,
    "authorUserId" INTEGER,
    "authorName" TEXT,
    "formId" INTEGER,
    "publishAt" DATETIME,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "shareCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Content_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContentTranslation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "contentId" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT NOT NULL,
    "seoTitle" TEXT,
    "seoKeywords" TEXT,
    "seoDesc" TEXT,
    CONSTRAINT "ContentTranslation_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Form" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "schema" TEXT NOT NULL,
    "relatedKey" TEXT,
    "antiDuplicate" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "FormSubmission" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "formId" INTEGER NOT NULL,
    "data" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "fingerprint" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FormSubmission_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT,
    "passwordHash" TEXT,
    "nickname" TEXT,
    "avatarUrl" TEXT,
    "wechatOpenId" TEXT,
    "wechatUnionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "contentId" INTEGER NOT NULL,
    "userId" INTEGER,
    "guestName" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "ip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Comment_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Like" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "targetType" TEXT NOT NULL DEFAULT 'CONTENT',
    "targetId" INTEGER NOT NULL,
    "userId" INTEGER,
    "guestKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ShareLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "targetType" TEXT NOT NULL DEFAULT 'CONTENT',
    "targetId" INTEGER NOT NULL,
    "ip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SensitiveWord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "word" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "path" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "alt" TEXT,
    "uploaderType" TEXT NOT NULL DEFAULT 'admin',
    "uploaderId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DailyStat" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" TEXT NOT NULL,
    "path" TEXT NOT NULL DEFAULT '*',
    "pv" INTEGER NOT NULL DEFAULT 0,
    "uv" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "BackupRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Setting_group_idx" ON "Setting"("group");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_group_key_key" ON "Setting"("group", "key");

-- CreateIndex
CREATE INDEX "UiTranslation_locale_idx" ON "UiTranslation"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "UiTranslation_locale_namespace_key_key" ON "UiTranslation"("locale", "namespace", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Agreement_type_locale_key" ON "Agreement"("type", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "SeoMeta_pageKey_locale_key" ON "SeoMeta"("pageKey", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryTranslation_categoryId_locale_key" ON "CategoryTranslation"("categoryId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "Content_slug_key" ON "Content"("slug");

-- CreateIndex
CREATE INDEX "Content_categoryId_status_idx" ON "Content"("categoryId", "status");

-- CreateIndex
CREATE INDEX "Content_status_publishAt_idx" ON "Content"("status", "publishAt");

-- CreateIndex
CREATE INDEX "ContentTranslation_locale_idx" ON "ContentTranslation"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "ContentTranslation_contentId_locale_key" ON "ContentTranslation"("contentId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "Form_slug_key" ON "Form"("slug");

-- CreateIndex
CREATE INDEX "FormSubmission_formId_createdAt_idx" ON "FormSubmission"("formId", "createdAt");

-- CreateIndex
CREATE INDEX "FormSubmission_fingerprint_idx" ON "FormSubmission"("fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_wechatOpenId_key" ON "User"("wechatOpenId");

-- CreateIndex
CREATE UNIQUE INDEX "User_wechatUnionId_key" ON "User"("wechatUnionId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_username_key" ON "AdminUser"("username");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "Comment_contentId_status_idx" ON "Comment"("contentId", "status");

-- CreateIndex
CREATE INDEX "Comment_status_idx" ON "Comment"("status");

-- CreateIndex
CREATE INDEX "Like_targetType_targetId_idx" ON "Like"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "Like_targetType_targetId_userId_key" ON "Like"("targetType", "targetId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Like_targetType_targetId_guestKey_key" ON "Like"("targetType", "targetId", "guestKey");

-- CreateIndex
CREATE INDEX "ShareLog_targetType_targetId_idx" ON "ShareLog"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "SensitiveWord_word_key" ON "SensitiveWord"("word");

-- CreateIndex
CREATE INDEX "MediaAsset_mime_idx" ON "MediaAsset"("mime");

-- CreateIndex
CREATE INDEX "DailyStat_date_idx" ON "DailyStat"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyStat_date_path_key" ON "DailyStat"("date", "path");

