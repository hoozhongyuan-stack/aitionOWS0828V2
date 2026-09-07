-- ============================================================
-- V4.1 后台子账号与操作日志:
--   AdminUser.role       规范化:存量 "admin" → "OWNER"(主账号);后续子账号为 STAFF
--   AdminUser.permissions 子账号预定义权限组(JSON 数组文本):["content","commerce","moderation","geo"]
--                        NULL=非子账号语义(OWNER 忽略此列)
--   AdminLog             操作日志表:谁/动作/对象/详情/IP/时间(审计;只增不改)
-- 纯增量,存量管理员行为零影响(全部归为主账号)。
-- ============================================================

UPDATE "AdminUser" SET "role" = 'OWNER' WHERE "role" = 'admin';

ALTER TABLE "AdminUser" ADD COLUMN "permissions" TEXT;
ALTER TABLE "AdminUser" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE'; -- ACTIVE/DISABLED(子账号禁用)

CREATE TABLE "AdminLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "adminId" INTEGER, -- 操作人(登录失败等场景可为 NULL)
    "adminName" TEXT NOT NULL, -- 显示名快照
    "action" TEXT NOT NULL, -- 动作标识(如 content.delete / settings.update / auth.login)
    "target" TEXT, -- 对象标识(如 content:12 / settings:theme)
    "detail" TEXT, -- 详情摘要(截断存储)
    "ip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AdminLog_adminId_createdAt_idx" ON "AdminLog"("adminId", "createdAt");
CREATE INDEX "AdminLog_createdAt_idx" ON "AdminLog"("createdAt");
