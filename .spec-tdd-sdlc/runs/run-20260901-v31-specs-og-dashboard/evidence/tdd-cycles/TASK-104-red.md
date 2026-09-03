# TASK-104 RED — 看板 API from/to 区间

- Run: run-20260901-v31-specs-og-dashboard
- Agent: implementer-B-v31
- Task: TASK-104(REQ-005,AC-006)
- Test: `tests/server/dashboard-range.test.ts`(TEST-204)
- 命令: `npx vitest run tests/server/dashboard-range.test.ts`
- 退出码: **1**
- UTC 时间戳: 2026-09-03T10:27:46Z

## 结果

```
Failed Tests 6
Tests  6 failed | 2 passed (8)
```

RED 失败均为行为缺失(直接调 `getDashboardStats` 与 route handler):

| 用例 | 失败证据(节选) |
| --- | --- |
| from=2026-08-01&to=2026-08-10 → 10 条序列 | `AssertionError: expected undefined to be defined`(无 range) |
| 跨度边界 92/93 | `Target cannot be null or undefined`(无 range;93 天未拒绝) |
| from>to/非法格式/单边 → 400 语义错误 | `promise resolved ... instead of rejecting`(不抛错) |
| to 为未来日期补 0 | `expected [] to have a length of 5 but got +0` |
| route 合法区间 200+range | `Target cannot be null or undefined` |
| route 非法参数 400 | `?from=2026-08-10&to=2026-08-01: expected 200 to be 400` |
| 无参数结构兼容(服务层/route) | **通过(2 条,既有契约锁,预期 RED 期通过)** |

结论:RED 成立,进入 GREEN。
