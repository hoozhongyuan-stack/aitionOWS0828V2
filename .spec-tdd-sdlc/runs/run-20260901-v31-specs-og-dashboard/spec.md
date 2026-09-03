---
spec_id: "SPEC-v31-specs-og-dashboard"
spec_version: 3
status: draft
risk_class: "high-risk"
g2_required: "yes"
---

# V3.1：规格表英文化 + 分享卡片 OG + 看板时间段趋势

## User-visible summary

英文站访客能看到英文的商品规格表（当前只有中文）；把任意页面链接分享到微信/QQ/Telegram 等工具时，卡片展示标题、摘要与缩略图（当前仅文章/商品详情有 OG，首页/栏目/联系页缺失，且无 metadataBase 导致图片可能不解析）；后台数据看板支持选择任意时间段（近 7/30/90 天或自定义起止）查看访问趋势（当前固定近 7 天）。

受益方：海外/英文访客（规格表）、站点所有者（分享传播效果）、管理员（灵活的流量分析）。

## Scope

### Included

- 规格表多语言（REQ-001/002）：`ContentTranslation.specs` 列 + 读取回退链 + 后台语言 Tab 编辑 + PUT 写入语义矩阵 + 迁移回填 + 回滚 SQL + 生产 7 个演示商品英文 specs 数据运营。
- 分享 OG（REQ-003/004）：根布局 `metadataBase`；首页/栏目页/联系页 openGraph；公共助手 `buildOpenGraph()`；文章/商品既有 OG 绝对化并统一兜底。
- 看板时间段（REQ-005/006）：`GET /api/admin/dashboard?from=&to=` 区间逐日 PV/UV；后台 UI 预设档 + 自定义起止。

### Not included

- gallery 多语言（维持主表共享）；历史 PV/UV 按路径的细分趋势（仅全站汇总）；微信 JS-SDK 自定义分享（OG 抓取已覆盖卡片需求）；主题外观配置（用户自行操作，无开发量）。
- 登录/注册/投稿/个人中心/协议/维护页等工具页维持现状（noindex 或无 metadata，不加 OG）；`buildOpenGraph()` 不推广至 REQ-003 列举之外的页面。

## Terminology

| 术语 | 定义 |
| --- | --- |
| OG | Open Graph 协议 meta 标签（og:title/og:description/og:image），被微信/QQ/Telegram/Slack 等用于渲染分享卡片 |
| metadataBase | Next.js metadata 基准 URL，相对路径图片/URL 据此解析为绝对地址 |
| specs 兜底链 | 详情页读取顺序：当前语言 translation.specs → Content.specs → 空表 |

## Context and constraints

- Existing behavior：specs 存 Content 主表跨语言共享（V3.0 有意取舍）；OG 仅文章/商品详情有且无 metadataBase；看板趋势固定近 7 天（`getDashboardStats` 硬编码，数据源 DailyStat 按天+路径聚合）。
- Repository evidence：`src/app/api/admin/contents/route.ts`（PUT 顶层 specs 数组）、`src/server/content/index.ts`（getProductDetail 读主表 specs）、`src/app/[locale]/layout.tsx`（无 metadataBase）、`page.tsx/contact/page.tsx/c/[slug]/page.tsx`（有 generateMetadata 输出 TDK，但无 openGraph；栏目页 `!data` 分支需一并处理）、`src/server/analytics`（week 硬编码）、`vitest.config.ts`（覆盖率 include=新增模块清单）。
- Constraints：页面/接口不直连 Prisma；SQLite 增量迁移手写 SQL（V3.0 先例：外键表 migrate diff 会生成重建式 SQL，需手写+收敛校验）；生产库停机窗口迁移（先停 app）。
- Assumptions：NEXT_PUBLIC_SITE_URL 已正确配置；测试基建与覆盖率口径沿用 V3.0（新增模块清单制）。

## Requirements

| ID | Status | Normative behavior | Rationale |
| --- | --- | --- | --- |
| REQ-001 | active | 系统必须支持按语言维护商品规格表：`ContentTranslation` 持有 specs（JSON 键值数组），详情页按兜底链渲染当前语言规格。写入语义矩阵：`translations[].specs` 为显式值（数组=该语言值，可为空数组；null=该语言无规格），编辑器必须全量往返各语言 Tab；顶层 `specs` 仅写入 Content.specs（兜底列），**不得**隐式改写任何翻译行。翻译行 specs 缺省（undefined）=保留该语言既有值（服务层在 deleteMany+recreate 前快照回填，或改逐行 upsert）。GET 编辑数据按语言返回 specs（供全量往返）。编辑器默认语言（zh-CN）Tab 保存时同步写入顶层 specs（保持兜底列与默认语言一致）。 | 需求①核心；全量往返保护 EN 数据运营成果 |
| REQ-002 | active | 迁移必须一次完成：新增 ContentTranslation.specs 可空列，并将每个翻译行回填为对应 Content.specs 的副本（无 specs 则 NULL）；不改不删既有列；可重复 deploy；回滚 SQL 随迁移交付。 | NFR 延续（存量无损） |
| REQ-003 | active | 根布局必须设置 metadataBase=NEXT_PUBLIC_SITE_URL；首页/栏目页/联系页必须输出 openGraph。取值来源：首页=SeoMeta(home) 的 title/description；联系页=SeoMeta(contact)；栏目页=栏目翻译名+描述（`!data` 时输出站点名+站点描述兜底）。图片兜底链：内容封面（栏目页=本栏目含子树的 PUBLISHED 内容按 publishAt desc,id desc 首条 coverUrl）→ 品牌 LOGO 绝对 URL → 均为空时省略 og:image。 | 需求②核心 |
| REQ-004 | active | 文章/商品详情既有 OG 语义必须保持（title/description 取值不变；商品 og:image=图集首图），并统一为绝对 URL；详情页无封面/图集时 og:image 兜底为品牌 LOGO（绝对 URL）。 | 兼容保护+统一兜底 |
| REQ-005 | active | 看板 API 必须支持 from/to 查询参数返回区间逐日 PV/UV。口径：取数仅 `path="*"` 全站汇总行（与 week/today 一致）；series[].date 输出 YYYY-MM-DD；跨度=to−from 日历日差 ≤92（序列含首尾）；from/to 必须成对出现否则 400；to 可晚于今天（未来日期计 0）；非法格式/from>to/单边参数均 400；无参数时返回值与现有结构完全兼容（week=近 7 天）。 | 需求③核心 |
| REQ-006 | active | 看板 UI 必须提供近 7/30/90 天预设与自定义起止日期选择，图表按所选区间渲染。 | 需求③交互 |
| NFR-001 | active | 迁移对存量数据无损且可重复执行（同 V3.0 NFR-003 标准）。 | 存量安全 |
| NFR-002 | active | OG image 必须为绝对 URL；兜底链=内容封面→LOGO→省略 og:image；不得输出相对路径。 | 分享抓取可靠性 |
| NFR-003 | active | 新增模块自动化覆盖率 ≥90/90/90/85（沿用 vitest 新增模块清单口径，清单随本 run 更新）。 | 质量门禁延续 |

## Acceptance criteria

| ID | Requirement links | Observable acceptance | Verification links |
| --- | --- | --- | --- |
| AC-001 | REQ-001 | Given 商品在 en 翻译下维护了 specs，when 访问 /en/product/[slug]，then 规格表渲染英文键值；zh-CN 页保持中文 specs；en 行不存在或行存在但 specs 为 NULL 时均回退主表 specs。 | TEST-101 |
| AC-002 | REQ-001 | Given 管理员在编辑页 en Tab 修改英文规格并保存，when 重新打开，then en specs 更新且 zh 行与主表 specs 不受影响（全量往返）；Given 仅变更顶层 specs 保存，then Content.specs 更新且各翻译行 specs 不被改写。 | TEST-102, TEST-M-101 |
| AC-003 | REQ-002 | 迁移在临时库演练：旧行保留、翻译行 specs=主表副本、可重复 deploy。 | TEST-201 |
| AC-004 | REQ-003 | Given 首页/任一栏目页/联系页，when 检查 HTML head，then 存在 og:title/og:description/og:image 且 image 为绝对 URL；无封面栏目 image=LOGO 绝对 URL。 | TEST-202 |
| AC-005 | REQ-004 | Given 文章/商品详情页，when 检查 head，then og 标签存在、图片绝对 URL、商品取图集首图；Given 无封面且无图集的详情页，then og:image=品牌 LOGO 绝对 URL。 | TEST-203 |
| AC-006 | REQ-005 | Given from=2026-08-01&to=2026-08-10，when 调用看板 API，then 返回 10 条逐日序列（date 为 YYYY-MM-DD，仅 path=* 口径）；from>to、日历日差 93、非法格式、只传单边各返回 400；to 为未来日期时序列含未来日且值为 0；无参数返回 week=近 7 天且结构兼容。 | TEST-204 |
| AC-007 | REQ-006 | Given 管理员点击「近 30 天」或输入自定义起止，when 图表刷新，then 展示对应区间逐日数据。 | TEST-205, TEST-M-102 |
| AC-008 | REQ-001 | 生产 7 个演示商品在 /en 下展示英文规格表（数据运营后人工核验）。 | TEST-M-103 |

## TDD and verification plan

| Test ID | AC links | Layer | Expected RED | GREEN evidence target |
| --- | --- | --- | --- | --- |
| TEST-101 | AC-001 | integration | en 翻译 specs 读取缺失/回退链不生效断言失败 | `npx vitest run tests/server/translation-specs.test.ts` |
| TEST-102 | AC-002 | integration | PUT translations[].specs 未持久化/顶层兼容失败断言失败 | `npx vitest run tests/server/translation-specs.test.ts` |
| TEST-201 | AC-003 | integration | 迁移缺失/回填不符断言失败 | `npx vitest run tests/db/migration-v31.test.ts` |
| TEST-202 | AC-004 | integration | 首页/栏目/联系页缺 og 或相对 URL 断言失败 | `npx vitest run tests/app/og-tags.test.ts` |
| TEST-203 | AC-005 | integration | 文章/商品 og 断言失败（回归锁） | `npx vitest run tests/app/og-tags.test.ts` |
| TEST-204 | AC-006 | integration | from/to 校验与序列断言失败 | `npx vitest run tests/server/dashboard-range.test.ts` |
| TEST-205 | AC-007 | unit | 预设/区间状态构造断言失败 | `npx vitest run tests/admin/dashboard-range-ui.test.ts` |
| TEST-M-101 | AC-002 | manual | 后台语言 Tab 编辑走查 | 截图+记录 |
| TEST-M-102 | AC-007 | manual | 看板筛选交互走查 | 截图+记录 |
| TEST-M-103 | AC-008 | manual | 生产 EN 规格表核验 | 截图+记录 |

## Contracts and failure behavior

- 数据契约（L2 迁移）：`ContentTranslation + specs String?`；回填 SQL UPDATE ... FROM Content；回滚=DROP COLUMN。
- 写入语义矩阵（specs）：`translations[].specs`=显式 per-locale 值（数组可为空/null）；顶层 `specs`=仅写 Content.specs 兜底列，**不触碰翻译行**；编辑器全量往返保证不丢数据（迁移回填后各行为非 NULL 副本，en 覆盖英文由数据运营/编辑器完成）。迁移回填仅发生在迁移时（一次性）。
- API 契约：看板 API 新增可选 from/to（成对、ISO、日历日差≤92、取数仅 path="*"、series date=YYYY-MM-DD、未来日补 0）；无参响应结构不变。contents PUT 契约见写入语义矩阵。
- 失败行为：specs JSON 非法 → 渲染空表（沿 V3.0 容错）；from/to 非法 → 400 jsonErr；OG 兜底链：内容封面 → LOGO → 均为空时省略 og:image。
- 兼容性：无参数看板、article/product 详情、既有编辑流全部不变。

## Design approval triggers

| Trigger | Applies | Evidence or decision |
| --- | --- | --- |
| Public contract or compatibility change | yes | 看板 API 新参数、contents PUT 扩展、全站 OG 输出 |
| Schema/data migration | yes | ContentTranslation.specs + 回填 |
| Auth, sensitive data, or security control | no | 无鉴权/敏感数据变化（看板仍 admin 会话内） |
| Production dependency, paid service, or external effect | no | 无新增依赖 |
| Destructive, difficult-to-recover, or major architectural choice | no | 增量迁移可回滚 |

G2 decision: required（High-risk 类：迁移 + 公共契约）。

## High-risk controls

- 迁移前生产备份（沿用 pre-v3 模式）；停 app 后迁移；临时库演练（两迁移序列+回填断言+幂等）；回滚 SQL 交付。
- OG 输出全部经 HTML 转义管道（Next metadata 机制天然转义）；metadataBase 仅取受信环境变量。
- 残余风险：历史 DailyStat 仅按天聚合，跨时区边界按服务器时间（现状不变）；迁移回填后 en 行为中文副本（非空），英文覆盖由数据运营/编辑器完成。

## Open decisions

| Decision | Options and trade-offs | Owner | Blocks |
| --- | --- | --- | --- |
| 无 | 范围/排期/兜底图（LOGO）/EN specs 补齐均已由用户确认 | user | none |

## Traceability status

- All MUST REQ/NFR items have AC links: yes
- All ACs have TEST or justified verification links: yes
- Independent Spec review: changes_requested（v1）→ ready_for_g1（v2 复核）→ v3 按复核遗留建议收口（评审者给出的确定性措辞）
- Unresolved Critical/High findings: 0（待评审）

## Version history

| Version | Change summary | Prior approval invalidated |
| --- | --- | --- |
| 1 | Initial draft（依据用户确认的 V3.1 规划起草） | not_applicable |
| 2 | 按独立评审处置 1C/1H/5M/2L：定义 specs 写入语义矩阵（全量往返，顶层 specs 不触碰翻译行）；看板取数口径（path=*、YYYY-MM-DD、跨度=日历日差≤92、成对参数、未来日补 0）；AC-002/005/006 重写；Scope 与 REQ 编号对齐、Context 证据措辞、栏目页封面口径、LOGO 空值兜底链、详情页无图兜底归属 | 无（v1 从未获批） |
| 3 | 复核遗留收口：Not included 补工具页 noindex/不加 OG 穷尽式边界；写入矩阵补「缺省=保留既有」；编辑器默认语言 Tab 同步顶层 specs；两处措辞残留对齐（OG 兜底链末端省略、残余风险表述） | 无（v1/v2 从未获批） |
