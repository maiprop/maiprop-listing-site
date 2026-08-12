import { describe, expect, it } from "vitest";
import { buildStagingLiveSecurityEvidence } from "./staging-live-security-evidence.mjs";

const releaseSha = "a".repeat(40);
const artifactSha256 = "b".repeat(64);

function report(overrides = {}) {
  return Buffer.from(
    JSON.stringify({
      suites: [
        {
          file: "rls-security.spec.ts",
          specs: [{ file: "rls-security.spec.ts", tests: [{ results: [{ status: "passed" }] }] }],
          suites: [],
        },
        {
          file: "gdpr-delete-account.spec.ts",
          specs: [{ file: "gdpr-delete-account.spec.ts", tests: [{ results: [{ status: "passed" }] }] }],
          suites: [],
        },
        {
          file: "onboarding-role-selection.spec.ts",
          specs: [{ file: "onboarding-role-selection.spec.ts", tests: [{ results: [{ status: "passed" }] }] }],
          suites: [],
        },
      ],
      errors: [],
      stats: {
        expected: 12,
        skipped: 0,
        unexpected: 0,
        flaky: 0,
        duration: 1250,
      },
      ...overrides,
    }),
  );
}

function build(reportBytes = report(), overrides = {}) {
  return buildStagingLiveSecurityEvidence({
    reportBytes,
    releaseSha,
    artifactSha256,
    stagingProjectRef: "xsiehskfgeoqyazcgauv",
    stagingAppUrl: "https://maiprop-listing-site-staging.pages.dev/path",
    createdAt: "2026-07-29T00:00:00.000Z",
    ...overrides,
  });
}

describe("staging live security evidence", () => {
  it("emits minimized exact-SHA evidence for the three required suites", () => {
    const evidence = build();

    expect(evidence).toMatchObject({
      schema_version: 1,
      evidence_type: "maiprop-staging-live-security",
      ok: true,
      release_sha: releaseSha,
      artifact_sha256: artifactSha256,
      target: {
        supabase_project_ref: "xsiehskfgeoqyazcgauv",
        app_origin: "https://maiprop-listing-site-staging.pages.dev",
      },
      playwright: {
        specs: [
          "gdpr-delete-account.spec.ts",
          "onboarding-role-selection.spec.ts",
          "rls-security.spec.ts",
        ],
        expected: 12,
        skipped: 0,
        unexpected: 0,
        flaky: 0,
        duration_ms: 1250,
      },
    });
    expect(evidence.playwright.report_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(evidence)).not.toContain("config");
    expect(JSON.stringify(evidence)).not.toContain("results");
  });

  it.each([
    ["skipped", { expected: 11, skipped: 1, unexpected: 0, flaky: 0, duration: 1 }],
    ["unexpected", { expected: 11, skipped: 0, unexpected: 1, flaky: 0, duration: 1 }],
    ["flaky", { expected: 11, skipped: 0, unexpected: 0, flaky: 1, duration: 1 }],
  ])("rejects %s test outcomes", (_label, stats) => {
    expect(() => build(report({ stats }))).toThrow(
      "must pass without skipped, unexpected, or flaky results",
    );
  });

  it("rejects incomplete suite coverage", () => {
    expect(() =>
      build(
        report({
          suites: [
            {
              file: "rls-security.spec.ts",
              specs: [{ file: "rls-security.spec.ts", tests: [{}] }],
              suites: [],
            },
            {
              file: "gdpr-delete-account.spec.ts",
              specs: [{ file: "gdpr-delete-account.spec.ts", tests: [{}] }],
              suites: [],
            },
          ],
        }),
      ),
    ).toThrow("covered gdpr-delete-account.spec.ts, rls-security.spec.ts");
  });

  it("rejects a named suite that did not execute any tests", () => {
    const parsed = JSON.parse(report().toString("utf8"));
    parsed.suites[0].specs = [];

    expect(() => build(Buffer.from(JSON.stringify(parsed)))).toThrow(
      "contains no tests for rls-security.spec.ts",
    );
  });

  it("rejects production and unknown Supabase targets", () => {
    expect(() =>
      build(report(), { stagingProjectRef: "qvvicunqcrwpioqnvzxf" }),
    ).toThrow("restricted to the designated staging project");
    expect(() =>
      build(report(), { stagingProjectRef: "abcdefghijklmnopqrst" }),
    ).toThrow("restricted to the designated staging project");
  });
});
