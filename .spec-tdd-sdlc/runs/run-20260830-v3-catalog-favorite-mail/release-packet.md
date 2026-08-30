# Release candidate approval

- Run: run-20260830-v3-catalog-favorite-mail
- Version: candidate-v1（SPEC-v3-catalog-favorite-mail v5）
- Spec version and hash: v5, b7ee035fed2fc0edc4f1afc4e64704ef5f5104191735755e81a9b869c27ecc0f
- Base commit: ce96eb1cc56428eee4c1509e013c3692162d1cde（main）
- Candidate commit: 15710b785a827fc0ad307815933e7b049758c488（feat/v3.0-spec-tdd）
- Risk level: High-risk（迁移/隐私/公共契约）｜action_risk L2

## Delivered outcomes

- 商品展示：product 栏目内容支持图集/规格参数；/product/[slug] SSR 详情（图集、参数表、询盘表单、Product JSON-LD、TDK、收藏）；商品栏目页二级分类导航与图卡列表；llms.txt 产品分区；sitemap 商品 URL；后台图集/参数编辑。询盘复用表单获客链路（防重/限频/通知）。
- 收藏与个人中心：POST /api/interaction/favorite（登录切换、401/404、事务计数同步、唯一约束兜底）；文章/商品详情收藏按钮（未登录跳登录回跳）；/account 双 Tab（我的收藏/我的投稿/退出）；页头入口；/submissions 3xx 兼容跳转。
- 用户资料：公司名称/国家/省/市仅后台维护（PATCH + q 公司名搜索）；前台全出口 toPublicUser 白名单隔离（TEST-013 锁定）。
- 邮件模板：品牌 HTML 模板层（品牌头/结构化区块/CTA/页脚，全内联样式，主题色注入）；密码重置（zh/en）、表单提交（含来源页/IP/时间）、投稿待审三类接入；静默失败语义不变。
- 非目标维持：无交易能力、微信分享卡片不做、隐私字段前台不可见、specs/gallery 不分语言。

## Traceability

- Requirements verified: REQ-001..013、NFR-001..006 全部 MUST 达成（21/21 AC 通过：20 automated + AC-020 automated(TEST-019)+manual(TEST-M-007)）
- Requirements not completed: 无
- Automated checks: vitest 19 文件 110 测试全绿；tsc --noEmit 0 错；next build 成功（41 静态页）；vitest --coverage 无 threshold ERROR
- Manual acceptance: TEST-M-001..007（走查清单已交付用户；QA 已预自动化其中结构性断言）
- Coverage policy: brownfield（无既有基线），按 Spec v5「新增模块清单」口径
- Coverage command and tool: npx vitest run --coverage（@vitest/coverage-v8）
- Coverage candidate commit: 15710b785a827fc0ad307815933e7b049758c488
- Coverage scope: 见 coverage-manifest.json scope（7 个新增模块）
- Statements / lines / functions / branches: 96.47 / 97.93 / 100 / 85.48
- Coverage evidence ID and hash: EVID-032（evidence/coverage-final.txt）+ TASK-REM-coverage.txt
- Brownfield baseline approval/source: N/A（存量无测试，基线为零，Spec v5 记录口径修正理由）
- Excluded paths and justification: none（无任何文件从插桩排除）
- Important uncovered paths, risk, and disposition: favorite.ts:72,178 防御性分支（无自然触发途径，低风险）；template.ts 配置读取失败兜底（NFR-004 静默语义有测试佐证）

## Independent review

- Code review: 初评 changes_requested（3H/4M/6L）→ 修复后复核 passed（REV-001/EVID-029）
- Security review: 初评 changes_requested（2M/3L，无 C/H）→ 复核 passed（REV-002/EVID-030）
- QA/E2E: 初评 changes_requested（AC-019）→ 修复后独立复验 passed（REV-003/EVID-031）；20/21 AC 主动实测验证
- Unresolved Critical/High findings: 0

## Release safety

- Known limitations: ①「评论待审」基线无管理员通知调用点，模板 kind=comment 为预置能力未接线（REQ-012 部分以现状为界）；②禁用账号收藏返回 401（与 like 的 403 语义差异，已文档化）；③listMyFavorites 不过滤已下架内容（仅业主自视图可见残留）；④Product JSON-LD 无 offers 的搜索引擎警告（已接受）；⑤branches 85.48% 贴近阈值，后续改动留意。
- Migration and backup: 一次纯增量迁移（7 ADD COLUMN + CREATE TABLE + 2 索引）；迁移前已备份（backups/pre-v3-migration/）；TEST-017 演练存量无损/幂等。
- Rollback: prisma/rollback-v3.sql（人工执行，SQLite≥3.35）；代码按 commit revert。
- Monitoring or post-release checks: 上线后走查 TEST-M-001..007（清单见 QA 报告）；观察 GEO 收录与邮件送达。
- Pending G4 actions: 无（本 run 无推送/合并/部署；如需合并回 main 或推送远程另行 G4）。

## Decision

- Recommendation: approve G3
- Alternatives and impact: request changes（将退回 VERIFYING 处置）；reject（终止本候选，已交付工件保留）
- Bound manifest hash: 见 gate-manifest.json（由 prepare-gate-package 生成）
- Reply with: approve G3 / request changes / reject
