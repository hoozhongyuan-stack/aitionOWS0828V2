-- ============================================================
-- V3.2 GEO 监测一期:AI 爬虫统计 + AI 渠道引荐统计
-- 对应需求:V3.2 GEO 监测一期(可见/可监控/说得上来渠道与时间)
-- 策略:纯增量建表(无外键,upsert 累加语义);不改不动既有表;
--       可重复执行(migrate deploy 登记机制)。
-- 说明:统计行由应用层 upsert 累加;明细保留策略(90 天清理)二期交付。
-- ============================================================

CREATE TABLE "AICrawlStat" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "bot" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX "AICrawlStat_bot_date_path_key" ON "AICrawlStat"("bot", "date", "path");
CREATE INDEX "AICrawlStat_date_bot_idx" ON "AICrawlStat"("date", "bot");

CREATE TABLE "AIReferralStat" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "source" TEXT NOT NULL,
    "landing" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "visitors" INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX "AIReferralStat_source_landing_date_key" ON "AIReferralStat"("source", "landing", "date");
CREATE INDEX "AIReferralStat_date_source_idx" ON "AIReferralStat"("date", "source");
