import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/test/**",
        "src/integrations/**",
        "src/components/ui/**",
        "src/**/*.d.ts",
        "src/main.tsx",
        "src/i18n.ts",
        "src/vite-env.d.ts",
      ],
      // Baseline thresholds — keep test runs honest without blocking incremental work.
      // Target: raise these incrementally as tests are added (see docs/testing.md).
      thresholds: {
        lines: 10,
        functions: 20,
        branches: 20,
        statements: 10,
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
