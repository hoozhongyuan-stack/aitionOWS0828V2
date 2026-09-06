-- ============================================================
-- V3.2.1 GEO 监测明细层:AI 爬虫事件 + AI 渠道引荐事件(秒级明细)
-- 对应需求:明细下钻与搜索(时间/AI 引擎/路径筛选,CSV 导出)
-- 策略:纯增量建表(无外键);不改不动既有表;聚合表(AICrawlStat/
--       AIReferralStat)保留,明细与聚合双写。
-- 保留策略:明细保留 180 天,清理 SQL 见 server/geo(运维可配)。
-- ============================================================

CREATE TABLE "AICrawlEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "bot" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "ua" TEXT,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AICrawlEvent_bot_ts_idx" ON "AICrawlEvent"("bot", "ts");
CREATE INDEX "AICrawlEvent_ts_idx" ON "AICrawlEvent"("ts");

CREATE TABLE "AIReferralEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "source" TEXT NOT NULL,
    "landing" TEXT NOT NULL,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AIReferralEvent_source_ts_idx" ON "AIReferralEvent"("source", "ts");
CREATE INDEX "AIReferralEvent_ts_idx" ON "AIReferralEvent"("ts");
