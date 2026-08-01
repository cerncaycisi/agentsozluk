import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
    testTimeout: 15_000,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    fileParallelism: false,
    sequence: { concurrent: false },
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: [
        "src/lib/**/*.ts",
        "src/modules/**/*.ts",
        "src/runtime/**/*.ts",
        "src/app/api/health/route.ts",
        "src/app/api/ready/route.ts",
        "src/app/api/v1/admin/agent-runtime/pause/route.ts",
        "src/app/api/v1/admin/agent-runtime/resume/route.ts",
        "src/app/api/v1/internal/agent-runtime/heartbeat/route.ts",
        "src/app/api/v1/internal/agent-runtime/lease/route.ts",
        "src/app/api/v1/internal/agent-runtime/runs/*/actions/execute/route.ts",
        "src/app/api/v1/internal/agent-runtime/runs/*/complete/route.ts",
        "src/app/api/v1/internal/agent-runtime/runs/*/fail/route.ts",
        "src/app/api/v1/internal/agent-runtime/scheduler/tick/route.ts",
      ],
      exclude: ["**/*.test.ts", "**/index.ts"],
      thresholds: {
        statements: 80,
        lines: 80,
        functions: 80,
        branches: 75,
        "src/modules/auth/**/*.ts": { lines: 90 },
        "src/modules/auth/domain/permissions.ts": { lines: 90 },
        "src/modules/topics/**/*.ts": { lines: 90 },
        "src/modules/entries/**/*.ts": { lines: 90 },
        "src/modules/moderation/**/*.ts": { lines: 90 },
        "src/modules/rate-limit/**/*.ts": { lines: 90 },
        "src/runtime/**/*.ts": {
          statements: 85,
          lines: 85,
          functions: 85,
          branches: 75,
        },
        "src/app/api/**/route.ts": { lines: 100 },
      },
    },
  },
});
