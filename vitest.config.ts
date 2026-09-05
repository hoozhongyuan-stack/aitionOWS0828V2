import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest 测试配置（SPEC-v3-catalog-favorite-mail REQ-013 测试基建）。
 * - 环境:node(服务层/集成测试为主,不渲染 React 组件)
 * - 别名:'@' 与 tsconfig paths 保持一致
 * - setupFiles:tests/setup/db.ts 负责临时 SQLite 测试库(应用全部迁移)
 * - coverage:@vitest/coverage-v8,阈值按 NFR-005(新增代码 90/90/90/85)
 */
export default defineConfig({
  // JSX 转换(rolldown-vite 默认不转换 JSX):允许单测渲染 SEO JSON-LD 等纯服务端组件(TEST-006)
  oxc: {
    jsx: {
      runtime: "automatic",
      importSource: "react",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["tests/setup/db.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      reporter: ["json-summary", "text"],
      reportsDirectory: "tests/.coverage",
      // NFR-005(v5 修订口径):仅对 G2 固化的「新增模块清单」计算覆盖率
      // (存量文件内的扩展行为由 TEST-001..019 行为测试锁定,不纳入百分比口径)。
      // 注:[locale] 是 glob 字符类语法,picomatch 无法可靠匹配字面方括号目录,
      //     故用 ** 通配该段;目录树中仅 (site)/account 存在 logic.ts,无歧义。
      include: [
        "src/server/ugc/favorite.ts",
        "src/server/user/profile.ts",
        "src/server/content/product.ts",
        "src/server/content/llms.ts",
        "src/server/notify/template.ts",
        "src/app/api/interaction/favorite/route.ts",
        "src/app/**/account/logic.ts",
        "src/lib/seo/open-graph.ts",
        "src/server/analytics/index.ts",
        "src/app/api/admin/dashboard/route.ts",
        "src/app/**/dashboard/logic.ts",
        "src/server/geo/index.ts",
        "src/server/layout/index.ts",
      ],
      exclude: ["**/*.d.ts"],
      thresholds: {
        statements: 90,
        lines: 90,
        functions: 90,
        branches: 85,
      },
    },
  },
});
