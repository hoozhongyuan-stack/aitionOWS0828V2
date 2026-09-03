# Design: design-v1

## Approved inputs

- Spec: `.spec-tdd-sdlc/runs/run-20260901-v31-specs-og-dashboard/spec.md`（SPEC-v31-specs-og-dashboard v3）
- Spec SHA-256: `176409530cb4fe74c17cc13f4b4af9a8f3c277348387f1ee4fead503afff5e77`
- G1 approval ID: APR-101（user approved）

## Recommended design

### Components and boundaries（全部经 `src/server/**` 服务层）

- **specs 多语言（REQ-001/002）**：
  - 迁移 `20260903_v31_translation_specs/migration.sql`（手写纯增量）：`ALTER TABLE "ContentTranslation" ADD COLUMN "specs" TEXT;` + 回填 `UPDATE ContentTranslation SET specs = (SELECT specs FROM Content WHERE Content.id = ContentTranslation.contentId);`（幂等性由 migrate deploy 登记机制保证）；收敛校验用 `prisma migrate diff`；回滚 `prisma/rollback-v31.sql`
  - `schema.prisma`：ContentTranslation +`specs String?`
  - `src/server/content/index.ts`：`getProductDetail`/文章详情读取链改为 `translation.specs ?? content.specs`（解析容错沿 V3.0）；`getContentForEdit` 返回每语言 specs（解析为数组）；`saveContent` 实现**写入语义矩阵**——事务内 deleteMany 前快照各语言旧 specs，`translations[].specs` 显式值优先、undefined=快照回填（保留既有）、null=空；顶层 specs 写 `Content.specs`
  - API：`contents` PUT schema 扩展 `translations[].specs`（数组/null/undefined 三态）；顶层 specs 语义不变（=兜底列）
  - 后台 `content/edit/[id]/page.tsx`：规格参数编辑器移入语言 Tab（各语言独立行编辑、全量往返）；默认语言（zh-CN）Tab 保存时同步写顶层 specs
- **OG（REQ-003/004）**：
  - `src/app/[locale]/layout.tsx`：metadata 增加 `metadataBase: new URL(NEXT_PUBLIC_SITE_URL)`
  - 新助手 `src/lib/seo/open-graph.ts`：`buildOpenGraph({ title, description, imagePath?, locale })` → 绝对化 image、兜底链（imagePath→LOGO 绝对→undefined）
  - 首页：OG（SeoMeta(home) title/description + 首条 Banner 图封面，无 Banner 用 LOGO）
  - 栏目页：OG（栏目翻译名+描述 + 栏目树内 PUBLISHED 首条 coverUrl；`!data` 时站点名+站点描述+LOGO）
  - 联系页：OG（SeoMeta(contact) + LOGO）
  - 文章/商品详情：改走 `buildOpenGraph()`（语义不变：商品 og:image=图集首图；无图兜底 LOGO）
- **看板时间段（REQ-005/006）**：
  - `src/server/analytics/index.ts`：`getDashboardStats(from?, to?)`——from/to 成对、ISO、日历日差≤92、否则抛 400 语义错误；区间序列仅取 `path="*"` 行、date 输出 YYYY-MM-DD、未来日补 0；无参保持 week=近 7 天
  - `src/app/api/admin/dashboard/route.ts`：透传 from/to 查询参数，非法 400 jsonErr
  - 后台 `dashboard/page.tsx`：预设档（近 7/30/90 天）+ 自定义起止 `<input type="date">`；图表按返回序列渲染（现有柱状组件扩展，date 显示 YYYY-MM-DD）

### Data model and lifecycle

- 仅一列新增：`ContentTranslation.specs TEXT?`（回填=对应 Content.specs 副本）；无新表、无既有列改动；Content.specs 保留为兜底列（编辑器默认语言 Tab 同步维护）

### Public/API contracts

| 契约 | 语义 |
| --- | --- |
| `PUT /api/admin/contents` | 顶层 specs（兜底列）不变；`translations[].specs` 三态（数组/null/undefined=保留既有） |
| `GET /api/admin/contents?id=` | translations[].specs 返回数组（解析后） |
| `GET /api/admin/dashboard?from&to` | 成对/合法→`{...现有字段, range:{from,to,series}}`；非法 400；无参结构不变 |
| 前台 OG | 首页/栏目/联系/文章/商品五类页面输出绝对 URL og 标签 |

### Authentication, authorization, privacy, and abuse controls

- 看板 API 保持 `requireAdmin`；OG 仅输出公开内容（SeoMeta/栏目名/封面），无敏感数据；metadataBase 仅取受信环境变量

### Failure behavior and observability

- specs JSON 非法→空表渲染（沿 V3.0 容错）；from/to 非法→400；OG 兜底链末端省略 og:image；迁移失败→容器启动中断（entrypoint 现状），回滚按备份+回滚 SQL

## Alternatives and trade-offs

| Option | Benefit | Cost/risk | Disposition |
|---|---|---|---|
| specs 存主表 bilingual 键（如「品牌 Brand」） | 零迁移 | 键污染、无法真正本地化 | 否决 |
| 顶层 specs 保存同步回填所有翻译行 | 「默认」语义直观 | 覆盖 EN 运营成果（评审 Critical 指出） | 否决，采用全量往返 |
| 看板区间 sum across paths | 数据更全 | UV 双计、与 week 口径冲突（评审 High 指出） | 否决，仅 path=* |
| OG 逐页手写 vs 公共助手 | — | 重复/不一致 | 采纳助手 |

## Migration and rollback

- 前置：生产备份（沿用 pre-v3x 模式，停 app 后执行）
- 顺序：临时库演练（baseline→…→本迁移，回填断言+幂等）→ 生产 migrate deploy（entrypoint 或手动 nohup）→ 启动冒烟
- Rollback：`prisma/rollback-v31.sql`（DROP COLUMN ContentTranslation.specs）；代码 git revert
- Irreversible effects: none（仅加列）

## Verification and residual risk

- Test layers：unit（buildOpenGraph/看板区间状态）→ integration（specs 读写/迁移演练/OG 页面断言/看板 API）→ manual（后台 Tab 编辑/看板筛选/生产 EN 规格核验）
- Security verification：OG 输出经 Next metadata 转义；无新鉴权面；code review + QA 双独立评审（无 auth/secret 变更，安全评审按触发条件豁免，理由记录）
- Residual risks and owners：EN specs 覆盖前英文页显示中文副本（渐进补齐，数据运营负责）；历史 DailyStat 时区边界按服务器时间（现状）
