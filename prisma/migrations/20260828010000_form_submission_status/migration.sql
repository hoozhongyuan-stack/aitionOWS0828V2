-- AlterTable:表单提交增加处理状态
ALTER TABLE "FormSubmission" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'UNHANDLED';
ALTER TABLE "FormSubmission" ADD COLUMN "handledAt" DATETIME;
