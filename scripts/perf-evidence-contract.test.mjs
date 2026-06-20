import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkPerformanceEvidenceContract } from "./perf-evidence-contract.mjs";

const makeFixture = ({
  loadTestEvidence = pendingEvidenceDoc(),
  doraEvidence = pendingDoraDoc(),
} = {}) => {
  const root = mkdtempSync(join(tmpdir(), "maiprop-perf-evidence-"));
  mkdirSync(join(root, "docs", "performance"), { recursive: true });
  mkdirSync(join(root, "docs", "compliance", "dora"), { recursive: true });
  writeFileSync(join(root, "docs", "performance", "LOAD_TEST_EVIDENCE.md"), loadTestEvidence);
  writeFileSync(join(root, "docs", "compliance", "dora", "PERFORMANCE_PROOF_LOG.md"), doraEvidence);
  return root;
};

function pendingEvidenceDoc() {
  return [
    "# Performance Load Test Evidence",
    "| Date | Environment | Profile | Base URL | Normalized summary artifact | Evidence status | Operator | Notes |",
    "|---|---|---|---|---|---|---|---|",
    "| 2026-06-20 | Staging | baseline_100 | Pending real operator input | Pending real operator execution | Pending operator execution | Pending operator execution | Template only; not proof. |",
    "",
    "Required live evidence fields: run timestamp, operator, BASE_URL, ECAS_LOAD_PROFILE, k6 command, normalized summary artifact, artifact SHA256, release SHA, monitoring window, and production approval record when applicable.",
  ].join("\n");
}

function pendingDoraDoc() {
  return [
    "# DORA Performance Proof Log",
    "| Date | Scenario | Evidence status | Operator | Evidence link | Decision |",
    "|---|---|---|---|---|---|",
    "| 2026-06-20 | Non-prod baseline and growth load proof | Pending operator execution | Pending operator execution | Pending normalized summary artifact | Pending review |",
    "",
    "Successful entries require run timestamp, operator, normalized summary artifact, artifact SHA256, release SHA, monitoring window, and approval reference for production hosts.",
  ].join("\n");
}

describe("performance evidence contract", () => {
  it("accepts pending templates that do not claim live proof", () => {
    const result = checkPerformanceEvidenceContract(makeFixture());

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("rejects successful evidence rows without real operator artifact fields", () => {
    const root = makeFixture({
      loadTestEvidence: [
        "# Performance Load Test Evidence",
        "| Date | Environment | Profile | Base URL | Normalized summary artifact | Evidence status | Operator | Notes |",
        "|---|---|---|---|---|---|---|---|",
        "| 2026-06-20 | Staging | growth_10x | https://staging.example.com | load-test-summary.json | Successful | Platform | Codex generated placeholder. |",
        "Required live evidence fields: run timestamp, operator, BASE_URL, ECAS_LOAD_PROFILE, k6 command, normalized summary artifact, artifact SHA256, release SHA, monitoring window, and production approval record when applicable.",
      ].join("\n"),
    });

    const result = checkPerformanceEvidenceContract(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("successful performance evidence rows must include artifact SHA256");
    expect(result.failures.join("\n")).toContain("successful performance evidence rows must not cite Codex-generated placeholder evidence");
  });

  it("requires both the performance and DORA evidence templates", () => {
    const result = checkPerformanceEvidenceContract(mkdtempSync(join(tmpdir(), "maiprop-perf-missing-")));

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("docs/performance/LOAD_TEST_EVIDENCE.md is missing");
    expect(result.failures.join("\n")).toContain("docs/compliance/dora/PERFORMANCE_PROOF_LOG.md is missing");
  });
});
