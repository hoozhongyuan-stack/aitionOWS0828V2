import { describe, expect, it } from "vitest";
import {
  PRESET_DAYS,
  MAX_RANGE_SPAN_DAYS,
  presetRange,
  resolveCustomRange,
  isValidDateString,
  toDateString,
  dashboardRangeQuery,
  resolveTrendSeries,
} from "@/app/[locale]/(admin)/admin/(panel)/dashboard/logic";

/**
 * TEST-205(AC-007 / REQ-006):看板筛选档纯逻辑(单元)。
 * 组件逻辑收敛在 dashboard/logic.ts(account/logic.ts 同款模式:
 * tsx 客户端组件无法被 vitest node 环境导入,纯函数一律收敛 .ts),
 * 本测试锁定「预设 → from/to 计算」「自定义区间校验」「查询串构造」
 * 「趋势序列选择(含旧结构回退)」;筛选交互走查由 TEST-M-102 覆盖。
 */
describe("TEST-205: 看板筛选档纯逻辑(REQ-006)", () => {
  it("提供近 7/30/90 三档预设,跨度上限与 server REQ-005 口径一致(92)", () => {
    expect(PRESET_DAYS).toEqual([7, 30, 90]);
    expect(MAX_RANGE_SPAN_DAYS).toBe(92);
  });

  it("presetRange:to=今天,from=今天-(days-1),自动处理跨月/跨年", () => {
    // 固定「今天」保证确定性(本地时区构造)
    expect(presetRange(7, new Date(2026, 8, 3))).toEqual({ from: "2026-08-28", to: "2026-09-03" });
    expect(presetRange(7, new Date(2026, 8, 1))).toEqual({ from: "2026-08-26", to: "2026-09-01" });
    expect(presetRange(30, new Date(2026, 0, 1))).toEqual({ from: "2025-12-03", to: "2026-01-01" });
    expect(presetRange(90, new Date(2026, 8, 3))).toEqual({ from: "2026-06-06", to: "2026-09-03" });
  });

  it("toDateString:本地时区 YYYY-MM-DD(0 填充)", () => {
    expect(toDateString(new Date(2026, 0, 2))).toBe("2026-01-02");
  });

  it("isValidDateString:严格 YYYY-MM-DD 且为真实日历日", () => {
    expect(isValidDateString("2026-08-01")).toBe(true);
    expect(isValidDateString("2026-8-1")).toBe(false); // 未 0 填充
    expect(isValidDateString("2026/08/01")).toBe(false); // 格式
    expect(isValidDateString("2026-02-30")).toBe(false); // 不存在的日期
    expect(isValidDateString("")).toBe(false);
  });

  it("resolveCustomRange:合法成对起止 → 区间;from>to/跨度 93/空值/非法格式 → null", () => {
    expect(resolveCustomRange("2026-08-01", "2026-08-10")).toEqual({
      from: "2026-08-01",
      to: "2026-08-10",
    });
    expect(resolveCustomRange("2026-05-01", "2026-08-01")).toEqual({
      from: "2026-05-01",
      to: "2026-08-01",
    }); // 日历日差 92 → 放行
    expect(resolveCustomRange("2026-08-10", "2026-08-01")).toBeNull(); // from>to
    expect(resolveCustomRange("2026-04-30", "2026-08-01")).toBeNull(); // 跨度 93
    expect(resolveCustomRange("", "2026-08-10")).toBeNull(); // 只填一端
    expect(resolveCustomRange("2026-08-01", null)).toBeNull();
    expect(resolveCustomRange("2026-8-1", "2026-08-10")).toBeNull(); // 非法格式
  });

  it("dashboardRangeQuery:构造 /api/admin/dashboard?from=&to= 查询串", () => {
    expect(dashboardRangeQuery({ from: "2026-08-01", to: "2026-08-10" })).toBe(
      "/api/admin/dashboard?from=2026-08-01&to=2026-08-10"
    );
  });

  it("resolveTrendSeries:优先 range.series(date=YYYY-MM-DD);无 range 回退 week(兼容旧结构)", () => {
    const ranged = resolveTrendSeries({
      week: [{ date: "09-01", pv: 1, uv: 1 }],
      range: { from: "2026-08-01", to: "2026-08-02", series: [{ date: "2026-08-01", pv: 5, uv: 2 }] },
    });
    expect(ranged).toEqual([{ date: "2026-08-01", pv: 5, uv: 2 }]);
    expect(ranged[0]?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/); // 图表日期展示口径

    expect(resolveTrendSeries({ week: [{ date: "09-01", pv: 1, uv: 1 }] })).toEqual([
      { date: "09-01", pv: 1, uv: 1 },
    ]);
  });
});
