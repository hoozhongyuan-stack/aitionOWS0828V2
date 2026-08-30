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
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup/db.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      reporter: ["json-summary", "text"],
      reportsDirectory: "tests/.coverage",
      include: ["src/server/**", "src/lib/**"],
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
