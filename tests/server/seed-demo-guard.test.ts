import { describe, expect, it } from "vitest";
import { decideDemoSeed } from "@/server/seed/demo-guard";

/**
 * 演示数据播种守卫(V4.6.6)。
 *
 * 锁的是 2026-09-13 的生产事故:seed 每次容器启动都跑,演示夹具用 upsert「只补缺失」,
 * 于是存量站点上被管理员删掉的演示内容,会在下一次发版重启时被种回来(V4.6.5 发布即命中)。
 * 判据必须是「首次初始化」而不是「某行是否存在」。
 */
describe("decideDemoSeed 演示数据播种守卫", () => {
  const fresh = { hasContent: false, hasCategory: false, hasForm: false, markerExists: false, disabled: false };

  it("全新空库:播种且落标记", () => {
    expect(decideDemoSeed(fresh)).toMatchObject({ run: true, markInitialized: true });
  });

  it("库中已有内容(存量站点):跳过——生产事故的直接回归锁", () => {
    const d = decideDemoSeed({ ...fresh, hasContent: true });
    expect(d.run).toBe(false);
    expect(d.reason).toContain("存量站点");
  });

  it("库中只剩栏目(内容被清空):仍跳过,不补演示数据", () => {
    expect(decideDemoSeed({ ...fresh, hasCategory: true }).run).toBe(false);
  });

  it("库中只剩表单:仍跳过", () => {
    expect(decideDemoSeed({ ...fresh, hasForm: true }).run).toBe(false);
  });

  it("一次性标记已存在:即使库被清空也永不再播种", () => {
    const d = decideDemoSeed({ ...fresh, markerExists: true });
    expect(d.run).toBe(false);
    expect(d.reason).toContain("一次性播种");
  });

  it("SEED_DEMO=0:显式关闭优先于一切(全新空库也不播种,且不落标记)", () => {
    const d = decideDemoSeed({ ...fresh, disabled: true });
    expect(d).toMatchObject({ run: false, markInitialized: false });
    expect(d.reason).toContain("SEED_DEMO=0");
  });

  it("显式关闭与标记同时存在:报显式关闭(优先级明确)", () => {
    const d = decideDemoSeed({ ...fresh, disabled: true, markerExists: true });
    expect(d.reason).toContain("SEED_DEMO=0");
  });

  it("存量站点跳过时也要落标记——否则清空内容后发版会把演示数据种回来", () => {
    expect(decideDemoSeed({ ...fresh, hasContent: true }).markInitialized).toBe(true);
    expect(decideDemoSeed({ ...fresh, hasCategory: true }).markInitialized).toBe(true);
    expect(decideDemoSeed({ ...fresh, hasForm: true }).markInitialized).toBe(true);
    // 已落标记(即标记已存在)时无需重复写
    expect(decideDemoSeed({ ...fresh, markerExists: true }).markInitialized).toBe(false);
  });
});
