# TASK-105 GREEN — 看板 UI 筛选档实现

- Run: run-20260901-v31-specs-og-dashboard
- Agent: implementer-B-v31
- Test: `tests/admin/dashboard-range-ui.test.ts`(TEST-205)
- 命令: `npx vitest run tests/admin/dashboard-range-ui.test.ts`
- 退出码: **0**
- UTC 时间戳: 2026-09-03T10:32:05Z

```
✓ tests/admin/dashboard-range-ui.test.ts (7 tests) 11ms
Tests  7 passed (7)
```

## 实现落点(GREEN 变更)

- 新增 `src/app/[locale]/(admin)/admin/(panel)/dashboard/logic.ts`(纯逻辑,可被 vitest node 导入):
  - `PRESET_DAYS=[7,30,90]`、`MAX_RANGE_SPAN_DAYS=92`(与 server REQ-005 口径一致);
  - `presetRange(days, now?)`:to=今天,from=今天−(days−1),自动跨月/跨年;
  - `isValidDateString()` / `resolveCustomRange()`:成对、严格 YYYY-MM-DD、from≤to、跨度≤92,非法 → null;
  - `dashboardRangeQuery(range)` → `/api/admin/dashboard?from=&to=`;
  - `resolveTrendSeries(stats)`:优先 `range.series`(date=YYYY-MM-DD),无 range 回退 `week`(结构兼容)。
- `src/app/[locale]/(admin)/admin/(panel)/dashboard/page.tsx`:顶部筛选档——「近 7 天/近 30 天/近 90 天」按钮 + 两个 `<input type="date">` + 「应用」;选中区间经 `?from=&to=` 拉取;切换区间清空旧数据;柱状图扩展为按返回序列渲染,date 完整展示 YYYY-MM-DD,`overflow-x-auto + min-w-max` 支持超宽横向滚动;默认近 7 天;标题显示当前区间。

## 全量确认

- `npx vitest run` → **0**(25 files / 149 tests)@ 2026-09-03T10:42:37Z(终版 seal;含 tsc --noEmit 0 / next build 0)
- 交互走查(TEST-M-102)由 QA 执行。
