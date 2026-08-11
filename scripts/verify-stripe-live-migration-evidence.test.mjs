import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

const RELEASE_SHA = "a".repeat(40);
const SOURCE_TREE = "b".repeat(40);
const RUN_ID = "77";
const NONCE = `${RUN_ID}:1:${RELEASE_SHA}`;
const verifierPath = resolve(
  "scripts/verify-stripe-live-migration-evidence.mjs",
);
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

async function verifier() {
  expect(
    existsSync(verifierPath),
    "Stripe live-readiness evidence verifier is missing",
  ).toBe(true);
  return import(pathToFileURL(verifierPath).href);
}

function report() {
  return {
    ok: true,
    account: {
      id: "acct_synthetic",
      display_name: "Synthetic account",
      country: "GR",
      default_currency: "eur",
    },
    checked: {
      catalog_products: 29,
      catalog_prices: 31,
      live_products_seen: 29,
      live_prices_seen: 31,
      supabase_rows_seen: 29,
      active_tax_registrations: 1,
      account_tax_ids: 1,
      webhook_endpoints: 1,
      portal_configurations: 1,
    },
    webhook: {
      id: "we_synthetic",
      url: "https://example.supabase.co/functions/v1/stripe-webhook",
    },
    issues: [],
    warnings: [],
  };
}

function provenance() {
  return {
    repository: "maiprop/maiprop-listing-site",
    release_sha: RELEASE_SHA,
    source_tree: SOURCE_TREE,
    workflow_path: ".github/workflows/verify-stripe-live-readiness.yml",
    workflow_ref:
      "maiprop/maiprop-listing-site/.github/workflows/verify-stripe-live-readiness.yml@refs/heads/main",
    workflow_sha: RELEASE_SHA,
    event: "workflow_dispatch",
    workflow_run_id: RUN_ID,
    workflow_run_attempt: "1",
    actor: "release-verifier",
    triggering_actor: "release-verifier",
    evidence_nonce: NONCE,
  };
}

describe("Stripe live migration evidence", () => {
  it("builds and verifies an exact attempt-one restricted-key tuple", async () => {
    const {
      createStripeLiveMigrationEvidence,
      verifyStripeLiveMigrationEvidence,
    } = await verifier();
    const evidence = createStripeLiveMigrationEvidence({
      report: report(),
      provenance: provenance(),
      stripeKey: "rk_live_synthetic",
      apiVersion: "2026-06-24.dahlia",
      checkedAt: "2026-08-12T00:00:00.000Z",
    });

    expect(evidence).toMatchObject({
      schema_version: 1,
      evidence_type: "maiprop-stripe-live-migration-readiness",
      ok: true,
      release_sha: RELEASE_SHA,
      source_tree: SOURCE_TREE,
      stripe: {
        mode: "live",
        key_prefix: "rk_live_...",
        account_id: "acct_synthetic",
      },
      provenance: {
        workflow_run_id: RUN_ID,
        workflow_run_attempt: "1",
        actor: "release-verifier",
        triggering_actor: "release-verifier",
      },
      issues: [],
    });
    expect(verifyStripeLiveMigrationEvidence(evidence, {
      releaseSha: RELEASE_SHA,
      workflowRunId: RUN_ID,
      workflowRunAttempt: "1",
      evidenceNonce: NONCE,
    })).toMatchObject({ ok: true, release_sha: RELEASE_SHA });
  });

  it.each([
    ["wrong release SHA", (value) => { value.release_sha = "c".repeat(40); }],
    ["rerun", (value) => { value.provenance.workflow_run_attempt = "2"; }],
    ["substituted actor", (value) => { value.provenance.triggering_actor = "other"; }],
    ["standard secret evidence", (value) => { value.stripe.key_prefix = "sk_live_..."; }],
    ["failed readiness", (value) => { value.ok = false; }],
    ["non-empty issues", (value) => { value.issues = ["catalog drift"]; }],
    ["wrong nonce", (value) => { value.provenance.evidence_nonce = "wrong"; }],
  ])("rejects %s", async (_label, mutate) => {
    const {
      createStripeLiveMigrationEvidence,
      verifyStripeLiveMigrationEvidence,
    } = await verifier();
    const evidence = createStripeLiveMigrationEvidence({
      report: report(),
      provenance: provenance(),
      stripeKey: "rk_live_synthetic",
      apiVersion: "2026-06-24.dahlia",
      checkedAt: "2026-08-12T00:00:00.000Z",
    });
    mutate(evidence);

    expect(() => verifyStripeLiveMigrationEvidence(evidence, {
      releaseSha: RELEASE_SHA,
      workflowRunId: RUN_ID,
      workflowRunAttempt: "1",
      evidenceNonce: NONCE,
    })).toThrow();
  });

  it("verifies the evidence through the CLI contract used by production", async () => {
    const { createStripeLiveMigrationEvidence } = await verifier();
    const root = mkdtempSync(join(tmpdir(), "maiprop-stripe-evidence-"));
    roots.push(root);
    const evidencePath = join(root, "stripe-live-migration-evidence.json");
    writeFileSync(evidencePath, `${JSON.stringify(createStripeLiveMigrationEvidence({
      report: report(),
      provenance: provenance(),
      stripeKey: "rk_live_synthetic",
      apiVersion: "2026-06-24.dahlia",
      checkedAt: "2026-08-12T00:00:00.000Z",
    }), null, 2)}\n`);

    const result = spawnSync(process.execPath, [
      verifierPath,
      "--evidence", evidencePath,
      "--release-sha", RELEASE_SHA,
      "--workflow-run-id", RUN_ID,
      "--workflow-run-attempt", "1",
      "--evidence-nonce", NONCE,
    ], { encoding: "utf8" });

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      release_sha: RELEASE_SHA,
      workflow_run_id: RUN_ID,
      workflow_run_attempt: "1",
    });
  });
});
