import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    pool: "forks",
    poolOptions: {
      forks: { singleFork: false },
    },
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "scripts/**/*.{test,spec}.{js,mjs}",
      "functions/**/*.{test,spec}.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html", "json-summary"],
      reportsDirectory: "./coverage",
      include: [
        "src/**/*.{ts,tsx}",
        "functions/**/*.ts",
      ],
      exclude: [
        "src/test/**",
        "src/integrations/**",
        "src/components/ui/**",
        "src/**/*.d.ts",
        "src/main.tsx",
        "src/i18n.ts",
        "src/vite-env.d.ts",
        "functions/**/*.{test,spec}.ts",
        "functions/tsconfig.json",
      ],
      // Baseline thresholds — these are FLOORS, not targets.
      //
      // Measured coverage (2026-05-05 — after Finding 7 any-removal sweep,
      // verified on CI Linux runner):
      //   lines      63.93%   threshold 63
      //   statements 63.93%   threshold 63
      //   functions  43.28%   threshold 43
      //   branches   60.92%   threshold 60
      //
      // The roadmap to lines 75 lives in docs/testing.md. Whenever a PR
      // adds meaningful coverage to a P0 page (Pricing, Dashboard,
      // Onboarding, Login, Signup, Messages), bump the threshold in the
      // SAME PR so we ratchet up monotonically and can never silently
      // regress. Do not lower these without explicit team agreement.
      thresholds: {
        lines: 63,
        functions: 43,
        branches: 60,
        statements: 63,
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
