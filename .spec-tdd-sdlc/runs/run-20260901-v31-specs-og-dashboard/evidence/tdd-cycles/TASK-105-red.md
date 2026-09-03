# TASK-105 RED — 看板 UI 筛选档纯逻辑

- Run: run-20260901-v31-specs-og-dashboard
- Agent: implementer-B-v31
- Task: TASK-105(REQ-006,AC-007)
- Test: `tests/admin/dashboard-range-ui.test.ts`(TEST-205)
- 命令: `npx vitest run tests/admin/dashboard-range-ui.test.ts`
- 退出码: **1**
- UTC 时间戳: 2026-09-03T10:31:05Z

## 结果

```
FAIL  tests/admin/dashboard-range-ui.test.ts
Error: Cannot find package '@/app/[locale]/(admin)/admin/(panel)/dashboard/logic' imported from
  .../tests/admin/dashboard-range-ui.test.ts
Tests  no tests
```

- 方案选择:page.tsx 为客户端组件("use client" + next-intl/sonner 等),vitest node 环境无法直接导入(与 `(site)/account/logic.ts` 注释的已知约束一致;曾考虑经 oxc jsx 直导 tsx,但组件依赖 apiGet/sonner 运行时,渲染测试需 jsdom+mock,不符合本仓口径)。按任务指示收敛:纯逻辑抽至 `dashboard/logic.ts`,交互走查归 TEST-M-102。
- RED 失败 = 「预设→from/to 计算」「自定义区间校验」「查询串构造」「趋势序列选择」等行为缺失(模块不存在)。
- 结论:RED 成立,进入 GREEN。
