# TASK-104 GREEN — 看板 API from/to 区间实现

- Run: run-20260901-v31-specs-og-dashboard
- Agent: implementer-B-v31
- Test: `tests/server/dashboard-range.test.ts`(TEST-204)
- 命令: `npx vitest run tests/server/dashboard-range.test.ts`
- 退出码: **0**
- UTC 时间戳: 2026-09-03T10:28:39Z

```
✓ tests/server/dashboard-range.test.ts (8 tests) 94ms
Tests  8 passed (8)
```

## 实现落点(GREEN 变更)

- `src/server/analytics/index.ts`:
  - `getDashboardStats(from?, to?)`:可选区间参数;新增 `range: { from, to, series }`;
  - 口径(REQ-005):仅取 `path="*"` 行(`date: { gte, lte }`);序列含首尾逐日连续;`date` 输出 YYYY-MM-DD;无数据日(含未来日)补 0;to 可晚于今天;
  - 校验:成对出现、严格 YYYY-MM-DD(真实日历日,拒绝 2026-02-30/2026-8-1)、from≤to、日历日差 ≤92;失败抛 `DashboardRangeError`(extends Error,`readonly status = 400`);
  - 无参数返回结构与既有契约完全兼容(today/week/totals,不含 range 键)。
- `src/app/api/admin/dashboard/route.ts`:`GET(request)` 解析 `searchParams` from/to → 透传;catch `DashboardRangeError` → `jsonErr(e.message, 400)`;其他异常原样抛出;`requireAdmin` 登录墙保持不变。
- **400 实现方式**:沿 `FavoriteTargetNotFoundError` 模式——服务层声明带 `status` 字段的语义错误类,路由层 `instanceof` 映射为 HTTP 400 jsonErr(报告口径:服务层持语义,路由持 HTTP)。

## 全量确认

- `npx vitest run` → **0**(25 files / 149 tests)@ 2026-09-03T10:42:37Z(终版 seal)
