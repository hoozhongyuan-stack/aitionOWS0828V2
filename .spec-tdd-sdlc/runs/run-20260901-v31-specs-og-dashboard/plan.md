# Implementation plan: plan-v1

## Bindings

- Spec SHA-256: `176409530cb4fe74c17cc13f4b4af9a8f3c277348387f1ee4fead503afff5e77`（SPEC-v31-specs-og-dashboard v3）
- Design SHA-256: 见 G2 批准包（design-v1）
- G2 approval ID: APR-102（待批准）

## Slices

| Task ID | Owner role | Requirements/AC | RED evidence | GREEN evidence | Verification | Commit |
|---|---|---|---|---|---|---|
| TASK-101 迁移+schema | implementer-A | REQ-002 + NFR-001 / AC-003 | TEST-201 RED | TEST-201 GREEN | 临时库演练+收敛校验 | C1 |
| TASK-102 specs 服务/API | implementer-A | REQ-001 / AC-001,002 | TEST-101/102 RED | GREEN | 全量回归 | C2 |
| TASK-103 OG 助手+页面 | implementer-B | REQ-003/004 / AC-004,005 | TEST-202/203 RED | GREEN | `next build` | C3 |
| TASK-104 看板 API | implementer-B | REQ-005 / AC-006 | TEST-204 RED | GREEN | 全量回归 | C4 |
| TASK-105 看板 UI | implementer-A | REQ-006 / AC-007 | TEST-205 RED | GREEN | MANUAL-102 走查 | C5 |
| TASK-106 后台 specs 编辑器 Tab 化 | implementer-A | REQ-001 / AC-002(UI 侧) | TEST-102 扩展 | GREEN | MANUAL-101 走查 | C5 |
| TASK-107 独立评审+覆盖率+QA | code-reviewer / QA | 全量 | — | 评审报告 | vitest 全量+coverage+`next build` | C6 |

## Dependencies and sequencing

- Production dependencies：无新增（vitest 已存在）
- Migration order：TASK-101 → 102 →（103 ∥ 104 → 105/106）→ 107；迁移一次完成，后续不得改 schema
- Parallel-safe file ownership：
  - implementer-A：`prisma/**`、`src/server/content/**`、`src/app/api/admin/contents/**`、`content/edit/[id]/**`、`dashboard/page.tsx`、`tests/db/**`、`tests/server/translation-specs.test.ts`、`tests/admin/**`
  - implementer-B：`src/lib/seo/**`、`src/app/[locale]/layout.tsx`、`(site)/page.tsx`、`c/[slug]/page.tsx`、`contact/page.tsx`、`article/[slug]/page.tsx`、`product/[slug]/page.tsx`、`src/server/analytics/**`、`src/app/api/admin/dashboard/**`、`tests/app/og-tags.test.ts`、`tests/server/dashboard-range.test.ts`、`tests/components/**`
  - 串行共享点：`messages/*.json`（如需新键由 orchestrator 合并）、`vitest.config.ts`（coverage include 清单由 TASK-107 统一更新）
- 部署与数据运营（生产 EN specs 补齐）在 G3 批准后执行

## Release preparation

- Coverage command and scope：`npx vitest run --coverage`，include 清单在既有基础上新增：`src/lib/seo/open-graph.ts`、`src/server/analytics/**`、`src/app/api/admin/dashboard/route.ts`、`src/app/api/interaction/favorite/route.ts`、`src/app/**/account/logic.ts`（既有 V3.0 清单保留）；阈值 90/90/90/85
- Independent review assignments：code-reviewer（Spec/diff 一致性）；QA（AC 验证矩阵+回归）；security-review 按触发条件豁免（无 auth/secret/依赖变化），理由记入 review 记录
- Rollback rehearsal：TEST-201 演练前向；回滚 SQL 评审
- G4 actions：push/合并/生产部署需另行 G4 批准
