import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
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
      // Current measured coverage (2026-05-04 — after Finding 7 sweep
      // removed all 15 legacy no-explicit-any suppressions in src/pages/):
      //   lines      ~63.84%   threshold 65  (ratcheted up from 60)
      //   statements ~63.84%   threshold 65  (ratcheted up from 60)
      //   functions  ~41.23%   threshold 43  (ratcheted up from 38)
      //   branches   ~58.98%   threshold 60  (ratcheted up from 55)
      //
      // Previous baseline (2026-04-26 — after Phase 3/4/5 sweep):
      //   lines/statements 63.84, functions 41.23, branches 58.98.
      //
      // The roadmap to lines 75 lives in docs/testing.md. Whenever a PR
      // adds meaningful coverage to a P0 page (Pricing, Dashboard,
      // Onboarding, Login, Signup, Messages), bump the threshold in the
      // SAME PR so we ratchet up monotonically and can never silently
      // regress. Do not lower these without explicit team agreement.
      thresholds: {
        lines: 65,
        functions: 43,
        branches: 60,
        statements: 65,
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
