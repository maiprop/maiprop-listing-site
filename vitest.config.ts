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
    ],
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
      // Baseline thresholds — these are FLOORS, not targets.
      //
      // Current measured coverage (2026-04-26 audit reconciliation):
      //   lines      ~11.88%   threshold 10  (margin 1.88)
      //   statements ~11.88%   threshold 10  (margin 1.88)
      //   functions  ~23.95%   threshold 18  (margin 5.95)
      //   branches   ~45.03%   threshold 36  (margin 9.03)
      //
      // The roadmap to lines 30 → 50 lives in docs/testing.md. Whenever a
      // PR adds meaningful coverage to a P0 page (Pricing, Dashboard,
      // Onboarding, Login, Signup, Messages), bump the threshold in the
      // SAME PR so we ratchet up monotonically and can never silently
      // regress. Do not lower these without explicit team agreement.
      thresholds: {
        lines: 10,
        functions: 18,
        branches: 36,
        statements: 10,
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
