import { defineConfig, devices } from "@playwright/test";

/**
 * E2E test config — runs against the local dev server (port 8080).
 *
 * Usage:
 *   npx playwright test               # all tests, headless
 *   npx playwright test --headed      # with browser visible
 *   npx playwright test --ui          # Playwright UI mode
 *   npx playwright test e2e/listings  # single suite
 *
 * Requires the app to be running:
 *   npm run dev
 * Or let webServer auto-start it (enabled below via process.env.CI).
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
    baseURL: process.env.CI ? "http://localhost:4173" : "http://localhost:8080",
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

  /* In CI: serve the pre-built dist/ via preview (faster than dev server).
   * Locally: assume `npm run dev` is already running on 8080. */
  webServer: process.env.CI
    ? {
        command: "npm run preview",
        url: "http://localhost:4173",
        reuseExistingServer: false,
        timeout: 30_000,
      }
    : undefined,
});
