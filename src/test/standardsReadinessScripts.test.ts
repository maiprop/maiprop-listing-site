import { describe, expect, it } from "vitest";

import { checkComplianceMatrix } from "../../scripts/check-compliance-matrix.mjs";
import { checkDoraReadiness } from "../../scripts/check-dora-readiness.mjs";
import { checkSlsaReadiness } from "../../scripts/check-slsa-readiness.mjs";
import { checkWcagCoverage } from "../../scripts/check-wcag-coverage.mjs";

describe("standards readiness gates", () => {
  it("keeps the compliance matrix mapped to every audited framework", () => {
    const check = checkComplianceMatrix(process.cwd());

    expect(check.failures).toEqual([]);
    expect(check.summary.frameworks).toEqual([
      "OWASP ASVS 5.0",
      "NIST SSDF 1.1",
      "CIS Controls v8.1",
      "DORA",
      "SLSA 1.2",
      "WCAG 2.2",
    ]);
  });

  it("keeps DORA operational-resilience evidence source controlled", () => {
    const check = checkDoraReadiness(process.cwd());

    expect(check.failures).toEqual([]);
    expect(check.summary.requiredDocuments).toBeGreaterThanOrEqual(5);
  });

  it("keeps SLSA provenance controls wired into release evidence", () => {
    const check = checkSlsaReadiness(process.cwd());

    expect(check.failures).toEqual([]);
    expect(check.summary.attestationWorkflowFiles.length).toBeGreaterThan(0);
  });

  it("keeps WCAG coverage broad enough for public and authenticated critical flows", () => {
    const check = checkWcagCoverage(process.cwd());

    expect(check.failures).toEqual([]);
    expect(check.summary.axeRoutes).toBeGreaterThanOrEqual(10);
  });
});
