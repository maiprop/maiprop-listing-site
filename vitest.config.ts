import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

const testSupabaseUrl =
  process.env.VITE_SUPABASE_URL ??
  process.env.VITE_SUPABASE_PROJECT_URL ??
  "https://abcdefghijklmnopqrst.supabase.co";
const testSupabasePublishableKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY ??
  "sb_publishable_test_key";

export default defineConfig({
  plugins: [react()],
  test: {
    pool: "forks",
    // Release-contract suites spawn many WSL/Bash/JQ child processes. Letting
    // Vitest use every logical CPU oversubscribes those nested processes and
    // makes otherwise healthy pre-push/CI runs time out under contention.
    maxWorkers: 4,
    environment: "jsdom",
    globals: true,
    // Full-suite jsdom/component imports can exceed Vitest's 5s default on CI
    // and pre-push hooks even when the same tests pass in isolation.
    testTimeout: 15_000,
    setupFiles: ["./src/test/setup.ts"],
    env: {
      VITE_SUPABASE_URL: testSupabaseUrl,
      VITE_SUPABASE_PUBLISHABLE_KEY: testSupabasePublishableKey,
    },
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "scripts/**/*.{test,spec}.{js,mjs}",
      "functions/**/*.{test,spec}.ts",
    ],
    exclude: [
      "scripts/catalogue-hotfix-behavioral-probe.test.mjs",
      "scripts/catalogue-hotfix-source-quality-probe.test.mjs",
      "scripts/catalogue-hotfix-workflow-helpers.test.mjs",
      "scripts/catalogue-performance-hotfix-contract.test.mjs",
      "scripts/catalogue-performance-hotfix-workflow.test.mjs",
      // These Node-native suites run through both local and coverage test gates.
      "scripts/deno-edge-coverage.test.mjs",
      "scripts/run-db-plpgsql-coverage.test.mjs",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html", "json-summary"],
      reportsDirectory: process.env.VITEST_COVERAGE_DIR ?? "./coverage",
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
      // Measured locally on 2026-07-13 after expanding business-branch
      // coverage across pricing, dashboards, listings, open houses,
      // onboarding, professional CRM, maps, and contact visibility.
      //   lines      90.71%   threshold 86
      //   statements 87.53%   threshold 81.9
      //   functions  86.60%   threshold 81
      //   branches   80.16%   threshold 80
      //
      // Whenever a PR
      // adds meaningful coverage to a P0 page (Pricing, Dashboard,
      // Onboarding, Login, Signup, Messages), bump the threshold in the
      // SAME PR so we ratchet up monotonically and can never silently
      // regress. Do not lower these without explicit team agreement.
      thresholds: {
        lines: 86,
        functions: 81,
        branches: 80,
        statements: 81.9,
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
