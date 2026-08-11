import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildStripeLiveMigrationEvidence,
  requireEvidenceVerificationReleaseSha,
  resolveCheckedOutReleaseSha,
  signStripeLiveMigrationEvidence,
  verifyStripeLiveMigrationEvidence,
} from "./stripe-live-migration-evidence.mjs";

describe("Stripe live migration evidence", () => {
  const workflowProvenance = {
    repository: "maiprop/maiprop-listing-site",
    workflowSha: "a".repeat(40),
    workflowRef:
      "maiprop/maiprop-listing-site/.github/workflows/verify-stripe-live-readiness.yml@refs/heads/main",
    eventSha: "a".repeat(40),
    eventName: "workflow_dispatch",
    actor: "release-reviewer",
    triggeringActor: "release-reviewer",
  };

  it("binds provider evidence to an exact release SHA and production Supabase target", () => {
    const releaseSha = "a".repeat(40);
    const evidence = buildStripeLiveMigrationEvidence({
      releaseSha,
      supabaseProjectRef: "qvvicunqcrwpioqnvzxf",
      stripeApiVersion: "2026-06-24.dahlia",
      account: { id: "acct_live", country: "GR" },
      checked: { catalog_products: 27 },
      webhook: { id: "we_live", url: "https://example.test/webhook" },
      issues: [],
      warnings: [],
      checkedAt: "2026-08-11T00:00:00.000Z",
      workflowRunId: "31532373459",
      workflowRunAttempt: "1",
      evidenceNonce: "31532373459:1:aaaaaaaa",
      ...workflowProvenance,
    });

    expect(evidence).toMatchObject({
      schema_version: 1,
      evidence_type: "maiprop-stripe-live-migration",
      ok: true,
      release_sha: releaseSha,
      supabase_project_ref: "qvvicunqcrwpioqnvzxf",
      stripe_api_version: "2026-06-24.dahlia",
      checked_at: "2026-08-11T00:00:00.000Z",
      provenance: {
        workflow_run_id: "31532373459",
        workflow_run_attempt: "1",
        evidence_nonce: "31532373459:1:aaaaaaaa",
        repository: "maiprop/maiprop-listing-site",
        workflow_sha: releaseSha,
        event_sha: releaseSha,
        event_name: "workflow_dispatch",
        actor: "release-reviewer",
        triggering_actor: "release-reviewer",
      },
    });
  });

  it("rejects abbreviated SHAs and non-production project identities", () => {
    const input = {
      stripeApiVersion: "2026-06-24.dahlia",
      account: { id: "acct_live" },
      checked: {},
      webhook: null,
      issues: [],
      warnings: [],
      checkedAt: "2026-08-11T00:00:00.000Z",
      workflowRunId: "31532373459",
      workflowRunAttempt: "1",
      evidenceNonce: "31532373459:1:aaaaaaaa",
      ...workflowProvenance,
    };

    expect(() => buildStripeLiveMigrationEvidence({
      ...input,
      releaseSha: "abc123",
      supabaseProjectRef: "qvvicunqcrwpioqnvzxf",
    })).toThrow(/full 40-character/i);
    expect(() => buildStripeLiveMigrationEvidence({
      ...input,
      releaseSha: "a".repeat(40),
      supabaseProjectRef: "xsiehskfgeoqyazcgauv",
    })).toThrow(/production Supabase/i);
  });

  it("binds evidence to a clean checked-out commit instead of trusting caller input", () => {
    const headSha = "b".repeat(40);

    expect(resolveCheckedOutReleaseSha({
      requestedSha: headSha,
      headSha,
      statusPorcelain: "",
    })).toBe(headSha);
    expect(() => resolveCheckedOutReleaseSha({
      requestedSha: "a".repeat(40),
      headSha,
      statusPorcelain: "",
    })).toThrow(/does not match checked-out HEAD/i);
    expect(() => resolveCheckedOutReleaseSha({
      requestedSha: headSha,
      headSha,
      statusPorcelain: " M scripts/check-stripe-live-migration.mjs",
    })).toThrow(/clean checkout/i);
    expect(() => requireEvidenceVerificationReleaseSha({
      requestedSha: null,
      headSha,
    })).toThrow(/expected release SHA is required/i);
    expect(requireEvidenceVerificationReleaseSha({
      requestedSha: headSha,
      headSha,
    })).toBe(headSha);
  });

  it("signs evidence and detects payload or signature tampering", () => {
    const evidence = buildStripeLiveMigrationEvidence({
      releaseSha: "c".repeat(40),
      supabaseProjectRef: "qvvicunqcrwpioqnvzxf",
      stripeApiVersion: "2026-06-24.dahlia",
      account: { id: "acct_live", country: "GR" },
      checked: { catalog_products: 27 },
      webhook: { id: "we_live", url: "https://example.test/webhook" },
      issues: [],
      warnings: [],
      checkedAt: "2026-08-11T00:00:00.000Z",
      workflowRunId: "31532373459",
      workflowRunAttempt: "1",
      evidenceNonce: "31532373459:1:cccccccc",
      ...workflowProvenance,
      workflowSha: "c".repeat(40),
      eventSha: "c".repeat(40),
    });
    const signingKey = "release-evidence-test-key-that-is-at-least-32-bytes";
    const signed = signStripeLiveMigrationEvidence(evidence, {
      signingKey,
      keyId: "github-actions-release-evidence-v1",
    });

    expect(signed.signature).toMatchObject({
      algorithm: "hmac-sha256",
      key_id: "github-actions-release-evidence-v1",
    });
    const verification = {
      signingKey,
      expectedKeyId: "github-actions-release-evidence-v1",
      now: new Date("2026-08-11T00:05:00.000Z"),
      expectedWorkflowRunId: "31532373459",
      expectedWorkflowRunAttempt: "1",
      expectedEvidenceNonce: "31532373459:1:cccccccc",
      expectedRepository: "maiprop/maiprop-listing-site",
      expectedWorkflowSha: "c".repeat(40),
      expectedWorkflowRef: workflowProvenance.workflowRef,
      expectedEventSha: "c".repeat(40),
      expectedEventName: "workflow_dispatch",
      expectedActor: "release-reviewer",
    };
    expect(verifyStripeLiveMigrationEvidence(signed, verification)).toBe(true);
    expect(verifyStripeLiveMigrationEvidence({
      ...signed,
      checked: { ...signed.checked, catalog_products: 26 },
    }, verification)).toBe(false);
    expect(verifyStripeLiveMigrationEvidence({
      ...signed,
      signature: { ...signed.signature, value: "0".repeat(64) },
    }, verification)).toBe(false);
    expect(verifyStripeLiveMigrationEvidence({
      ...signed,
      signature: { ...signed.signature, key_id: "forged-key" },
    }, verification)).toBe(false);
    expect(verifyStripeLiveMigrationEvidence(signed, {
      ...verification,
      expectedKeyId: "wrong-key",
    })).toBe(false);
    const { expectedKeyId: _expectedKeyId, ...missingKeyIdVerification } = verification;
    expect(verifyStripeLiveMigrationEvidence(
      signed,
      missingKeyIdVerification,
    )).toBe(false);
    expect(verifyStripeLiveMigrationEvidence(signed, {
      ...verification,
      now: new Date("2026-08-11T01:00:00.000Z"),
    })).toBe(false);
    expect(verifyStripeLiveMigrationEvidence({
      ...signed,
      schema_version: 2,
    }, verification)).toBe(false);
    expect(verifyStripeLiveMigrationEvidence({
      ...signed,
      evidence_type: "other-evidence",
    }, verification)).toBe(false);
    expect(verifyStripeLiveMigrationEvidence(signed, {
      ...verification,
      expectedWorkflowSha: "d".repeat(40),
    })).toBe(false);
    expect(verifyStripeLiveMigrationEvidence(signed, {
      ...verification,
      expectedWorkflowRunId: "999",
    })).toBe(false);
  });

  it("requires an allowlisted exact-SHA workflow to generate and verify live evidence", () => {
    const workflow = readFileSync(
      resolve(import.meta.dirname, "..", ".github", "workflows", "verify-stripe-live-readiness.yml"),
      "utf8",
    );

    expect(workflow).toContain("PRODUCTION_RELEASE_APPROVERS");
    expect(workflow).toContain("github.run_attempt != 1");
    expect(workflow).toContain("github.actor != github.triggering_actor");
    expect(workflow).toContain("STRIPE_RESTRICTED_KEY");
    expect(workflow).toContain("check:stripe-live-migration");
    expect(workflow).toContain("verify:stripe-live-migration-evidence");
    expect(workflow).not.toContain("environment: production");
    expect(workflow).not.toContain("actions/attest-build-provenance@");
  });
});
