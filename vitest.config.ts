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
      // Current measured coverage (2026-04-26 — after Phase 3/4/5 sweep
      // added curated form, hook and component tests across 17 files):
      //   lines      ~63.84%   threshold 60  (margin 3.84)
      //   statements ~63.84%   threshold 60  (margin 3.84)
      //   functions  ~41.23%   threshold 38  (margin 3.23)
      //   branches   ~58.98%   threshold 55  (margin 3.98)
      //
      // Previous baseline (2026-04-26 — after lib/hook/context/route-guard
      // sweep): lines/statements 53.98, functions 30.44, branches 48.10.
      //
      // Original audit baseline (2026-04-26):
      //   lines 11.88, statements 11.88, functions 23.95, branches 45.03.
      //
      // The roadmap to lines 60 → 75 lives in docs/testing.md. Whenever a
      // PR adds meaningful coverage to a P0 page (Pricing, Dashboard,
      // Onboarding, Login, Signup, Messages), bump the threshold in the
      // SAME PR so we ratchet up monotonically and can never silently
      // regress. Do not lower these without explicit team agreement.
      thresholds: {
        lines: 60,
        functions: 38,
        branches: 55,
        statements: 60,
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
