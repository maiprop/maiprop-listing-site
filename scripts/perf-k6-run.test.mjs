import { describe, expect, it } from "vitest";
import { buildK6RunPlan, validateK6RunConfig } from "./perf-k6-run.mjs";

describe("perf k6 wrapper", () => {
  it("requires BASE_URL instead of silently targeting a default host", () => {
    const result = validateK6RunConfig({
      env: { ECAS_LOAD_PROFILE: "smoke" },
      argv: [],
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("BASE_URL is required. Set BASE_URL or pass --base-url.");
  });

  it("validates the supported ECAS load profiles", () => {
    const result = validateK6RunConfig({
      env: { BASE_URL: "https://staging.example.com", ECAS_LOAD_PROFILE: "peak" },
      argv: [],
    });

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("ECAS_LOAD_PROFILE must be one of: smoke, baseline_100, growth_10x, enterprise_soak");
  });

  it("blocks production hosts unless the explicit approval env var is set", () => {
    const result = validateK6RunConfig({
      env: { BASE_URL: "https://portal.maiprop.co", ECAS_LOAD_PROFILE: "baseline_100" },
      argv: [],
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("Production load tests require LOAD_TEST_APPROVED_PRODUCTION=true.");
  });

  it("allows production hosts only with LOAD_TEST_APPROVED_PRODUCTION=true", () => {
    const result = validateK6RunConfig({
      env: {
        BASE_URL: "https://portal.maiprop.co",
        ECAS_LOAD_PROFILE: "baseline_100",
        LOAD_TEST_APPROVED_PRODUCTION: "true",
      },
      argv: [],
    });

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.config.productionHost).toBe(true);
  });

  it("builds a k6 command with normalized environment and artifact directory", () => {
    const plan = buildK6RunPlan({
      env: {},
      argv: [
        "--base-url",
        "https://staging.example.com/",
        "--profile",
        "growth_10x",
        "--summary-dir",
        "artifacts/perf",
      ],
    });

    expect(plan.ok).toBe(true);
    expect(plan.command).toBe("k6");
    expect(plan.args).toEqual(["run", "scripts/load-test/basic.js"]);
    expect(plan.env.BASE_URL).toBe("https://staging.example.com");
    expect(plan.env.ECAS_LOAD_PROFILE).toBe("growth_10x");
    expect(plan.env.LOAD_TEST_SUMMARY_DIR).toBe("artifacts/perf");
  });
});
