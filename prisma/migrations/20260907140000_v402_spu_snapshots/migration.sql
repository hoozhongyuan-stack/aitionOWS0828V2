-- ============================================================
-- V4.0.2 商品 SPU + 订单明细快照扩展:
--   Content.spu          商品货号(自由文本,选填,商品维度属性)
--   OrderItem.spu        下单时 SPU 快照(存量订单为 NULL,展示侧容错)
--   OrderItem.coverUrl   下单时封面图快照(订单明细缩略图;历史一致)
-- 纯增量三列,均 nullable,存量零影响。
-- ============================================================

ALTER TABLE "Content" ADD COLUMN "spu" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "spu" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "coverUrl" TEXT;
