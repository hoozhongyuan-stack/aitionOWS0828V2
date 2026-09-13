-- ============================================================
-- V4.6.4 爬虫/引荐统计分区:
--   四张统计表各加 kind 列('ai' | 'search' | 'suspected'),默认 'ai'。
--   口径隔离:AI 可见性(GEO)与 传统搜索引擎抓取 分开计数,不被污染;
--   'suspected' 为启发式推测(通用 UA 抓取),独立只读区块展示,不进正式指标。
-- 纯增量:ADD COLUMN + DEFAULT,存量数据全部归 'ai'(与升级前口径一致)。
-- ============================================================

ALTER TABLE "AICrawlStat" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'ai';
ALTER TABLE "AICrawlEvent" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'ai';
ALTER TABLE "AIReferralStat" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'ai';
ALTER TABLE "AIReferralEvent" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'ai';

CREATE INDEX "AICrawlStat_kind_date_idx" ON "AICrawlStat"("kind", "date");
CREATE INDEX "AICrawlEvent_kind_ts_idx" ON "AICrawlEvent"("kind", "ts");
CREATE INDEX "AIReferralStat_kind_date_idx" ON "AIReferralStat"("kind", "date");
CREATE INDEX "AIReferralEvent_kind_ts_idx" ON "AIReferralEvent"("kind", "ts");
