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
const CHECKED_AT = "2026-08-12T00:00:00.000Z";
const NOW = new Date("2026-08-12T00:10:00.000Z");
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
      id: "acct_1TnuLTGfOEgBOxtl",
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
      payment_method_configurations: 1,
    },
    webhook: {
      id: "we_synthetic",
      url: "https://example.supabase.co/functions/v1/stripe-webhook",
    },
    payment_method_configuration: {
      ok: true,
      configuration_id: "pmc_synthetic",
      is_default: true,
      enabled_payment_methods: ["card", "link"],
      issue: null,
    },
    restricted_key_permission: {
      denied: true,
      status: 403,
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
      supabaseProjectRef: "qvvicunqcrwpioqnvzxf",
      checkedAt: CHECKED_AT,
    });

    expect(evidence).toMatchObject({
      schema_version: 2,
      evidence_type: "maiprop-stripe-live-migration-readiness",
      ok: true,
      release_sha: RELEASE_SHA,
      source_tree: SOURCE_TREE,
      supabase_project_ref: "qvvicunqcrwpioqnvzxf",
      stripe: {
        mode: "live",
        key_prefix: "rk_live_...",
        account_id: "acct_1TnuLTGfOEgBOxtl",
      },
      provenance: {
        workflow_run_id: RUN_ID,
        workflow_run_attempt: "1",
        actor: "release-verifier",
        triggering_actor: "release-verifier",
      },
      issues: [],
      payment_method_configuration: {
        ok: true,
        configuration_id: "pmc_synthetic",
        is_default: true,
      },
      restricted_key_permission: { denied: true, status: 403 },
    });
    expect(verifyStripeLiveMigrationEvidence(evidence, {
      releaseSha: RELEASE_SHA,
      workflowRunId: RUN_ID,
      workflowRunAttempt: "1",
      evidenceNonce: NONCE,
      now: NOW,
    })).toMatchObject({ ok: true, release_sha: RELEASE_SHA });
  });

  it.each([
    ["wrong release SHA", (value) => { value.release_sha = "c".repeat(40); }],
    ["rerun", (value) => { value.provenance.workflow_run_attempt = "2"; }],
    ["substituted actor", (value) => { value.provenance.triggering_actor = "other"; }],
    ["standard secret evidence", (value) => { value.stripe.key_prefix = "sk_live_..."; }],
    ["wrong Stripe account", (value) => {
      value.stripe.account_id = "acct_wrongbutvalid";
      value.account.id = "acct_wrongbutvalid";
    }],
    ["failed readiness", (value) => { value.ok = false; }],
    ["non-empty issues", (value) => { value.issues = ["catalog drift"]; }],
    ["write-capable readiness key", (value) => {
      value.restricted_key_permission.denied = false;
    }],
    ["missing card configuration", (value) => {
      value.payment_method_configuration.enabled_payment_methods = ["link"];
    }],
    ["non-default configuration", (value) => {
      value.payment_method_configuration.is_default = false;
    }],
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
      supabaseProjectRef: "qvvicunqcrwpioqnvzxf",
      checkedAt: CHECKED_AT,
    });
    mutate(evidence);

    expect(() => verifyStripeLiveMigrationEvidence(evidence, {
      releaseSha: RELEASE_SHA,
      workflowRunId: RUN_ID,
      workflowRunAttempt: "1",
      evidenceNonce: NONCE,
      now: NOW,
    })).toThrow();
  });

  it.each([
    ["stale evidence", "2026-08-11T23:54:59.000Z"],
    ["excessive future skew", "2026-08-12T00:11:01.000Z"],
  ])("rejects %s", async (_label, checkedAt) => {
    const {
      createStripeLiveMigrationEvidence,
      verifyStripeLiveMigrationEvidence,
    } = await verifier();
    const evidence = createStripeLiveMigrationEvidence({
      report: report(),
      provenance: provenance(),
      stripeKey: "rk_live_synthetic",
      apiVersion: "2026-06-24.dahlia",
      supabaseProjectRef: "qvvicunqcrwpioqnvzxf",
      checkedAt,
    });

    expect(() => verifyStripeLiveMigrationEvidence(evidence, {
      releaseSha: RELEASE_SHA,
      workflowRunId: RUN_ID,
      workflowRunAttempt: "1",
      evidenceNonce: NONCE,
      now: NOW,
    })).toThrow();
  });

  it("rejects evidence built for staging Supabase", async () => {
    const { createStripeLiveMigrationEvidence } = await verifier();

    expect(() => createStripeLiveMigrationEvidence({
      report: report(),
      provenance: provenance(),
      stripeKey: "rk_live_synthetic",
      apiVersion: "2026-06-24.dahlia",
      supabaseProjectRef: "xsiehskfgeoqyazcgauv",
      checkedAt: CHECKED_AT,
    })).toThrow(/production Supabase/);
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
      supabaseProjectRef: "qvvicunqcrwpioqnvzxf",
      checkedAt: new Date().toISOString(),
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
