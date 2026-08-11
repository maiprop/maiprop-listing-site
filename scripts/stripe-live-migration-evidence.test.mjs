import { describe, expect, it } from "vitest";

import {
  buildStripeLiveMigrationEvidence,
  requireEvidenceVerificationReleaseSha,
  resolveCheckedOutReleaseSha,
  signStripeLiveMigrationEvidence,
  verifyStripeLiveMigrationEvidence,
} from "./stripe-live-migration-evidence.mjs";

describe("Stripe live migration evidence", () => {
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
    });

    expect(evidence).toMatchObject({
      schema_version: 1,
      evidence_type: "maiprop-stripe-live-migration",
      ok: true,
      release_sha: releaseSha,
      supabase_project_ref: "qvvicunqcrwpioqnvzxf",
      stripe_api_version: "2026-06-24.dahlia",
      checked_at: "2026-08-11T00:00:00.000Z",
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
    expect(verifyStripeLiveMigrationEvidence(signed, { signingKey })).toBe(true);
    expect(verifyStripeLiveMigrationEvidence({
      ...signed,
      checked: { ...signed.checked, catalog_products: 26 },
    }, { signingKey })).toBe(false);
    expect(verifyStripeLiveMigrationEvidence({
      ...signed,
      signature: { ...signed.signature, value: "0".repeat(64) },
    }, { signingKey })).toBe(false);
  });
});
