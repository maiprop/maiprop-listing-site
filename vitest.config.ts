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
      // Current measured coverage (2026-04-26 — after curated lib/hook/
      // context/route-guard test sweep added 163 tests across 16 files):
      //   lines      ~53.98%   threshold 50  (margin 3.98)
      //   statements ~53.98%   threshold 50  (margin 3.98)
      //   functions  ~30.44%   threshold 28  (margin 2.44)
      //   branches   ~48.10%   threshold 45  (margin 3.10)
      //
      // Previous baseline (2026-04-26 audit, before sweep):
      //   lines 11.88, statements 11.88, functions 23.95, branches 45.03.
      //
      // The roadmap to lines 50 → 70 lives in docs/testing.md. Whenever a
      // PR adds meaningful coverage to a P0 page (Pricing, Dashboard,
      // Onboarding, Login, Signup, Messages), bump the threshold in the
      // SAME PR so we ratchet up monotonically and can never silently
      // regress. Do not lower these without explicit team agreement.
      thresholds: {
        lines: 50,
        functions: 28,
        branches: 45,
        statements: 50,
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
