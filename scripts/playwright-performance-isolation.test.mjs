import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("performance browser isolation", () => {
  it.each(["true", ""])("uses one timing worker with CI=%s", async (ci) => {
    vi.stubEnv("CI", ci);
    vi.stubEnv("MAIPROP_RUNNING_PERF_GATE", "1");
    vi.resetModules();
    const { default: config } = await import("../playwright.config.ts");
    expect(config.workers).toBe(1);
  });

  it("retains parallel CI workers for ordinary functional tests", async () => {
    vi.stubEnv("CI", "true");
    vi.stubEnv("MAIPROP_RUNNING_PERF_GATE", "");
    vi.stubEnv("npm_lifecycle_event", "test");
    vi.resetModules();
    const { default: config } = await import("../playwright.config.ts");
    expect(config.workers).toBe(2);
  });
});
