# Implementation plan: plan-v1

## Bindings

- Spec SHA-256: `62bf6cffd04823b9b21c4f185ebc8bfdbed79a7a7c566215e45e1393da219897`（SPEC-v3-catalog-favorite-mail v4）
- Design SHA-256: 见 G2 批准包（design-v1）
- G2 approval ID: APR-002（待批准）

## Slices

| Task ID | Owner role | Requirements/AC | RED evidence | GREEN evidence | Verification | Commit |
|---|---|---|---|---|---|---|
| TASK-001 测试基建 | implementer-A | REQ-013 / AC-017 | 不适用（基建验收，TEST-000 冒烟即证据） | `tests/smoke.test.ts` 通过 | `npx vitest run` exit 0 | C1 |
| TASK-002 schema+迁移 | implementer-A | REQ-001/005/009 + NFR-003 / AC-015 | TEST-017 RED：迁移缺失时临时库无法 apply/断言失败 | TEST-017 GREEN | 临时库演练 + 启动冒烟 | C2 |
| TASK-003 商品数据层 | implementer-A | REQ-001/002/003 + NFR-006 / AC-001,002,003,004,016,021 | TEST-001/002/003/004/005/018 RED | 各 focused GREEN | 全量回归 | C3, C4 |
| TASK-004 商品前台页面 | implementer-B | REQ-002/003 + NFR-002 / AC-018,020 | TEST-019 RED（/product/[slug] 404） | TEST-019 GREEN | `next build` 通过 | C5 |
| TASK-005 商品 SEO | implementer-B | REQ-004 / AC-005 | TEST-006/007 RED | GREEN | JSON-LD 可解析断言 | C6 |
| TASK-006 后台商品编辑 | implementer-A | REQ-001 / AC-001 | TEST-001 扩展（admin 更新入口）+ TEST-M-001 | GREEN | MANUAL-001 走查 | C7 |
| TASK-007 收藏服务+API | implementer-B | REQ-005 / AC-006,021 | TEST-008 RED | GREEN | 全量回归 | C8 |
| TASK-008 收藏前端+个人中心 | implementer-A | REQ-006/007/008 / AC-007,008,009 | TEST-009/010/011 RED | GREEN | MANUAL-003/004 走查 | C9 |
| TASK-009 用户资料+隐私 | implementer-B | REQ-009 + NFR-001 / AC-010,011 | TEST-012/013 RED | GREEN | MANUAL-005 走查 | C10 |
| TASK-010 邮件模板层 | implementer-A | REQ-010/011/012 + NFR-004 / AC-012,013,014,021 | TEST-014/015/016 RED | GREEN | MANUAL-006 走查 | C11 |
| TASK-011 种子（可选 non-normative） | implementer-A | Included（non-normative） | 不适用 | seed 幂等运行 | `npm run db:seed` 两遍幂等 | C12 |
| TASK-012 独立评审与 QA | code-reviewer / security-reviewer / QA | 全量 | 不适用 | 评审报告 | 全量回归+coverage+走查 | C13（修复提交如需） |

## Dependencies and sequencing

- **Production dependencies requiring approval（G2 披露）**：devDependencies 新增 `vitest`、`@vitest/coverage-v8`（不进入生产依赖，next build 产物不变）。
- Migration order：TASK-001 → TASK-002 →（TASK-003 → TASK-004/005/006）∥（TASK-007 → TASK-008）∥ TASK-009 ∥ TASK-010；TASK-011 在 C2 后任意时点；TASK-012 最后。
- Parallel-safe work and file ownership（并发 ≤ 3 子代理，文件互不重叠）：
  - implementer-A：`tests/setup`、`vitest.config.ts`、`prisma/**`、`src/server/content/**`、`src/app/[locale]/(site)/c/**`、`src/app/[locale]/(admin)/admin/(panel)/content/**`、`src/app/[locale]/(site)/account/**`、`src/server/notify/**`
  - implementer-B：`src/app/[locale]/(site)/product/**`、`src/components/seo/**`、`src/app/llms.txt`、`src/app/api/interaction/**`、`src/server/ugc/**`、`src/app/[locale]/(site)/submissions`、`src/app/[locale]/(admin)/admin/(panel)/users/**`、`src/server/user/**`
  - 共享冲突点串行化：`src/components/site/interaction-bar`（仅 TASK-008）、`src/components/site/content-card`（仅 TASK-003）、`src/components/site/header`（仅 TASK-008）、`messages/*.json`（各任务完成后由 orchestrator 串行合并键）、`prisma/schema.prisma`（仅 TASK-002）
- 迁移一次完成（TASK-002），后续任务不得再改 schema（如需则回 G2）。

## Release preparation

- Coverage command and scope（v5 口径）：`npx vitest run --coverage`，coverage.include = **新增模块清单**（G2 修订固化）：`src/server/ugc/favorite.ts`、`src/server/user/profile.ts`、`src/server/content/product.ts`、`src/server/notify/template.ts`、`src/app/api/interaction/favorite/route.ts`、`src/app/[locale]/(site)/account/logic.ts`；阈值 90/90/90/85（NFR-005 / AC-019）。存量文件内的扩展行为（content/ugc/user/notify 的 index.ts 等）由 TEST-001..019 行为测试锁定，不纳入百分比口径。
- Independent review assignments：code-reviewer（Spec/diff 一致性、可维护性）、security-reviewer（隐私出口、登录墙、邮件注入、迁移安全——auth/sensitive data 在范围内，强制评审）、QA（AC 独立验证、回归、手工走查督导）；三身份互异且不参与实现。
- Rollback rehearsal：TEST-017 已演练迁移前向；回滚 SQL 脚本随迁移提交交付并评审。
- G4 actions, if any：本 run 无（不 push/merge/部署）；如需合并回 main 或推送远程，另行提交 G4 批准包。
