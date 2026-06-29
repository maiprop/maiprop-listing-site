import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function loadPlaywrightConfig() {
  vi.resetModules();
  const module = await import("../../playwright.config");
  return module.default as {
    webServer?: {
      command?: string;
      env?: Record<string, string | undefined>;
    };
  };
}

describe("Playwright local environment contract", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.CI;
    delete process.env.PLAYWRIGHT_BASE_URL;
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_PROJECT_URL;
    delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.VITE_SUPABASE_ANON_KEY;
    process.env.npm_lifecycle_event = "test:e2e";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it("starts local E2E web servers with safe placeholder Supabase env", async () => {
    const config = await loadPlaywrightConfig();

    expect(config.webServer?.env).toMatchObject({
      VITE_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_e2e_placeholder_not_real_000000000000",
    });
  });

  it("preserves explicit real Supabase env when provided", async () => {
    process.env.VITE_SUPABASE_URL = "https://realprojectref0000.supabase.co";
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_real_key";

    const config = await loadPlaywrightConfig();

    expect(config.webServer?.env).toMatchObject({
      VITE_SUPABASE_URL: "https://realprojectref0000.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_real_key",
    });
  });
});
