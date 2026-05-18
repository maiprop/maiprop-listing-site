import { defineConfig, devices } from "@playwright/test";

const defaultBaseURL = process.env.CI
  ? "http://localhost:4173"
  : "http://localhost:8080";
const isPerformanceGate =
  process.env.npm_lifecycle_event === "test:perf" ||
  process.argv.some((arg) => arg.includes("performance-gates.spec.ts"));
const configuredBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = configuredBaseURL ?? (isPerformanceGate ? "http://localhost:4173" : defaultBaseURL);
const shouldStartLocalServer =
  !configuredBaseURL &&
  (baseURL.startsWith("http://localhost") ||
    baseURL.startsWith("http://127.0.0.1"));

/**
 * E2E test config — runs against the local dev server (port 8080).
 *
 * Usage:
 *   npx playwright test               # all tests, headless
 *   npx playwright test --headed      # with browser visible
 *   npx playwright test --ui          # Playwright UI mode
 *   npx playwright test e2e/listings  # single suite
 *
 * Playwright starts the right server automatically:
 *   - CI: npm run preview on port 4173 after the production build
 *   - Local perf gate: npm run preview on port 4173 after `npm run build`
 *   - Local: npm run dev on port 8080, reusing an existing server when present
 */
export default defineConfig({
  testDir: "./e2e",
  /* Max time one test can run — 45s covers slow Supabase auth flows */
  timeout: 45_000,
  /* Max time to wait for assertions */
  expect: { timeout: 8_000 },
  /* Fail fast in CI */
  forbidOnly: !!process.env.CI,
  /* Retry once locally and in CI — handles Supabase auth rate-limiting under parallel load */
  retries: 1,
  /* Parallelism — cap at 3 locally to avoid Supabase auth rate-limiting under high parallel load */
  workers: process.env.CI ? 2 : 3,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL,
    /* Keep screenshots/traces only on failure */
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
  ],

  /* In CI: serve the pre-built dist/ via preview.
   * Locally: start Vite dev server unless one is already running. */
  webServer: shouldStartLocalServer
    ? process.env.CI || isPerformanceGate
      ? {
          command: "npm run preview",
          url: "http://localhost:4173",
          reuseExistingServer: !process.env.CI,
          timeout: 30_000,
        }
      : {
          command: "npm run dev -- --host 127.0.0.1 --port 8080",
          url: "http://localhost:8080",
          reuseExistingServer: true,
          timeout: 30_000,
        }
    : undefined,
});
