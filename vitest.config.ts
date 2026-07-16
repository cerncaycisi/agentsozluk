import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    sequence: { concurrent: false },
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: ["src/lib/**/*.ts", "src/modules/**/*.ts"],
      exclude: ["**/*.test.ts", "**/index.ts"],
      thresholds: {
        statements: 80,
        lines: 80,
        functions: 80,
        branches: 75,
      },
    },
  },
});
