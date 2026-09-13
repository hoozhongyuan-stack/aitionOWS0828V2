/**
 * 演示数据播种守卫(V4.6.6)。
 *
 * 背景(生产事故):seed 在每次容器启动都会执行,而演示夹具(news 栏目 + 欢迎内容 +
 * 演示商品栏目树 + 演示商品)用的是 upsert「只补缺失」。这在库为空的全新部署里是想要
 * 的行为,但在**已上线站点**上,管理员删掉演示内容后,下一次发版重启就会把它原样种回来
 * ——2026-09-13 的 V4.6.5 发布即命中(生产库被重新插入 3 条演示内容 + 3 个演示栏目)。
 *
 * 因此这里把「要不要播种演示数据」抽成纯函数,判据是"首次初始化",而不是"某行是否存在":
 * - 显式关闭(SEED_DEMO=0)优先
 * - 一次性标记已写入 → 永不再播
 * - 库中已有内容/栏目/表单任一 → 存量站点,不补演示数据
 */
export interface DemoSeedFacts {
  /** 库中是否已有内容 */
  hasContent: boolean;
  /** 库中是否已有栏目 */
  hasCategory: boolean;
  /** 库中是否已有表单 */
  hasForm: boolean;
  /** 一次性标记(Setting group=seed,key=demoSeeded)是否存在 */
  markerExists: boolean;
  /** 环境变量显式关闭(SEED_DEMO=0) */
  disabled: boolean;
}

export interface DemoSeedDecision {
  /** 是否播种演示数据 */
  run: boolean;
  /**
   * 是否写入一次性标记。两种情况下写:
   * - 播种完成之后;
   * - 确认过「该库是存量站点」之后——这样即使管理员日后把内容全部清空,
   *   下一次发版也不会因为「看起来是空库」而把演示数据种回来。
   * 显式关闭(SEED_DEMO=0)时不写,保留「空库 + 显式开启」的余地。
   */
  markInitialized: boolean;
  reason: string;
}

export function decideDemoSeed(facts: DemoSeedFacts): DemoSeedDecision {
  if (facts.disabled) {
    return { run: false, markInitialized: false, reason: "SEED_DEMO=0 显式关闭" };
  }
  if (facts.markerExists) {
    return { run: false, markInitialized: false, reason: "已完成一次性播种(seed.demoSeeded)" };
  }
  if (facts.hasContent || facts.hasCategory || facts.hasForm) {
    return {
      run: false,
      markInitialized: true,
      reason: "库中已有内容/栏目/表单,按存量站点处理,不补演示数据",
    };
  }
  return { run: true, markInitialized: true, reason: "首次初始化" };
}

/** 演示数据播种完成后写入的一次性标记(Setting 表的 group/key) */
export const DEMO_SEED_MARKER = { group: "seed", key: "demoSeeded" } as const;
