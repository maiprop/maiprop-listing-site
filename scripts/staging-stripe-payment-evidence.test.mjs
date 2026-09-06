import { describe, expect, it } from "vitest";
import { createStagingStripePaymentEvidence } from "./staging-stripe-payment-evidence.mjs";

const sha = "a".repeat(40);
const digest = "b".repeat(64);
const report = {
  stats: {
    expected: 1,
    skipped: 0,
    unexpected: 0,
    flaky: 0,
  },
  suites: [{
    title: "stripe-payment-complete.spec.ts",
    file: "stripe-payment-complete.spec.ts",
    suites: [],
    specs: [{
      title:
        "completes test-card subscription checkout and observes synced entitlement",
      file: "stripe-payment-complete.spec.ts",
      ok: true,
      tests: [{
        projectName: "chromium",
        expectedStatus: "passed",
        status: "expected",
        results: [{ status: "passed", duration: 321 }],
      }],
    }],
  }],
};

const input = (overrides = {}) => ({
  report,
  reportBytes: Buffer.from(JSON.stringify(report)),
  releaseSha: sha,
  artifactSha256: digest,
  supabaseProjectRef: "xsiehskfgeoqyazcgauv",
  appOrigin: "https://staging.maiprop.example",
  ...overrides,
});

describe("staging Stripe payment evidence", () => {
  it("binds one zero-skip test payment to the exact staging candidate", () => {
    const evidence = createStagingStripePaymentEvidence(input());

    expect(evidence).toMatchObject({
      schema_version: 1,
      evidence_type: "maiprop-staging-stripe-payment",
      ok: true,
      release_sha: sha,
      artifact_sha256: digest,
      target: {
        supabase_project_ref: "xsiehskfgeoqyazcgauv",
        app_origin: "https://staging.maiprop.example",
        stripe_mode: "test",
      },
      playwright: {
        spec: "stripe-payment-complete.spec.ts",
        test_title:
          "completes test-card subscription checkout and observes synced entitlement",
        project_name: "chromium",
        outcome: "passed",
        result_statuses: ["passed"],
        expected: 1,
        skipped: 0,
        unexpected: 0,
        flaky: 0,
      },
    });
    expect(evidence.playwright.report_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    [{ expected: 0, skipped: 1, unexpected: 0, flaky: 0 }, /exactly one/i],
    [{ expected: 2, skipped: 0, unexpected: 0, flaky: 0 }, /exactly one/i],
    [{ expected: 1, skipped: 0, unexpected: 1, flaky: 0 }, /zero skipped/i],
    [{ expected: 1, skipped: 0, unexpected: 0, flaky: 1 }, /zero skipped/i],
  ])("rejects incomplete Playwright stats %#", (stats, message) => {
    expect(() =>
      createStagingStripePaymentEvidence(input({
        report: { ...report, stats },
      }))
    ).toThrow(message);
  });

  it("rejects aggregate success that does not contain the exact payment test", () => {
    const wrongIdentity = structuredClone(report);
    wrongIdentity.suites[0].specs[0].title = "another test";
    expect(() => createStagingStripePaymentEvidence(input({
      report: wrongIdentity,
    }))).toThrow(/exact Stripe payment test/i);
  });

  it("rejects duplicate exact payment identities even when aggregate stats claim one test", () => {
    const duplicate = structuredClone(report);
    duplicate.suites[0].specs.push(structuredClone(duplicate.suites[0].specs[0]));
    expect(() => createStagingStripePaymentEvidence(input({
      report: duplicate,
    }))).toThrow(/exactly one exact Stripe payment test identity/i);
  });

  it("rejects an exact payment test whose recorded result did not pass", () => {
    const failed = structuredClone(report);
    failed.suites[0].specs[0].ok = false;
    failed.suites[0].specs[0].tests[0].status = "unexpected";
    failed.suites[0].specs[0].tests[0].results[0].status = "failed";
    expect(() => createStagingStripePaymentEvidence(input({
      report: failed,
    }))).toThrow(/recorded result/i);
  });

  it("rejects a production or arbitrary Supabase target", () => {
    expect(() =>
      createStagingStripePaymentEvidence(input({
        supabaseProjectRef: "qvvicunqcrwpioqnvzxf",
      }))
    ).toThrow(/staging Supabase/i);
  });

  it("rejects non-HTTPS and path-bearing app origins", () => {
    expect(() =>
      createStagingStripePaymentEvidence(input({
        appOrigin: "http://staging.maiprop.example/path",
      }))
    ).toThrow(/HTTPS origin/i);
  });
});
