-- ============================================================
-- V4.0 海外独立站起步:商品交易化 + 订单(线下付款后台审核)
-- 策略:纯增量——Content 加可空列,新建 Order/OrderItem;存量零影响。
-- 金额一律整数"分"(priceCents),避免浮点误差;OrderItem 快照模式
-- (title/price 下单快照),contentId 不加外键(内容删除后快照保留,
-- 应用层维护,同 Content.formId 模式)。
-- ============================================================

ALTER TABLE "Content" ADD COLUMN "priceCents" INTEGER;
ALTER TABLE "Content" ADD COLUMN "currency" TEXT;

CREATE TABLE "Order" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "no" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING', -- PENDING/CONFIRMED/SHIPPED/COMPLETED/CANCELLED
    "userId" INTEGER,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "country" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "zip" TEXT,
    "note" TEXT,
    "currency" TEXT NOT NULL,
    "itemsTotalCents" INTEGER NOT NULL,
    "shippingCents" INTEGER NOT NULL DEFAULT 0,
    "grandTotalCents" INTEGER NOT NULL,
    "adminNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "confirmedAt" DATETIME,
    "shippedAt" DATETIME,
    "completedAt" DATETIME,
    "cancelledAt" DATETIME
);
CREATE UNIQUE INDEX "Order_no_key" ON "Order"("no");
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");
CREATE INDEX "Order_email_idx" ON "Order"("email");

CREATE TABLE "OrderItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" INTEGER NOT NULL,
    "contentId" INTEGER NOT NULL,
    "titleSnapshot" TEXT NOT NULL,
    "priceCentsSnapshot" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
