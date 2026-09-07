-- ============================================================
-- V4.2 订单售后(仅退款,不含退换货;一单一次申请):
--   OrderRefund 售后申请:用户提交原因 → 后台审核(通过填退款金额/拒绝填原因)
--   Order 状态机扩展第 6 态 REFUNDED(由 CONFIRMED/SHIPPED/COMPLETED 流转;refundedAt 记录退款时间)
-- 退款打款为线下操作,系统只记录审批结果(与线下付款模式一致)。
-- ============================================================

CREATE TABLE "OrderRefund" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING', -- PENDING/APPROVED/REJECTED
    "refundAmountCents" INTEGER, -- 审核通过时填写(≤订单实付)
    "adminNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    CONSTRAINT "OrderRefund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OrderRefund_orderId_key" ON "OrderRefund"("orderId");

ALTER TABLE "Order" ADD COLUMN "refundedAt" DATETIME;
