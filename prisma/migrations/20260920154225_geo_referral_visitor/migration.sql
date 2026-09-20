-- CreateTable
CREATE TABLE "AIReferralVisitor" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "source" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "landing" TEXT NOT NULL DEFAULT '/',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AIReferralVisitor_date_idx" ON "AIReferralVisitor"("date");

-- CreateIndex
CREATE UNIQUE INDEX "AIReferralVisitor_source_date_visitorId_key" ON "AIReferralVisitor"("source", "date", "visitorId");
