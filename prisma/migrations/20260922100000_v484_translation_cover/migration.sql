-- V4.8.4 多语言封面:ContentTranslation 加 coverUrl(该语言专属封面)。
-- NULL=回退主表 Content.coverUrl(默认/中文封面);存量行全 NULL,行为与迁移前完全一致,零回填。
ALTER TABLE "ContentTranslation" ADD COLUMN "coverUrl" TEXT;
