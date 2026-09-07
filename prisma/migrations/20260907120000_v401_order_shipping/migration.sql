-- ============================================================
-- V4.0.1 订单物流字段:发货时登记物流公司/物流编号(均非必填,可空)。
-- 发货备注沿用 Order.adminNote;纯增量两列,存量零影响。
-- ============================================================

ALTER TABLE "Order" ADD COLUMN "shippingCarrier" TEXT;
ALTER TABLE "Order" ADD COLUMN "trackingNumber" TEXT;
