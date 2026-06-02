import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    pool: "forks",
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
      // Baseline thresholds are floors, not targets.
      //
      // Measured locally on 2026-06-02 after adding hotspot tests for AI
      // search, firesale admin components, Google Maps Places loading,
      // image galleries, pro services, listing draft, and building listing
      // flows.
      //   lines      86.08%   threshold 86
      //   statements 81.99%   threshold 81.9
      //   functions  81.08%   threshold 81
      //   branches   71.25%   threshold 71
      //
      // Whenever a PR
      // adds meaningful coverage to a P0 page (Pricing, Dashboard,
      // Onboarding, Login, Signup, Messages), bump the threshold in the
      // SAME PR so we ratchet up monotonically and can never silently
      // regress. Do not lower these without explicit team agreement.
      thresholds: {
        lines: 86,
        functions: 81,
        branches: 71,
        statements: 81.9,
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
