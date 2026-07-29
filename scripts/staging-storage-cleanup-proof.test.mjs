import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "vitest";
import assert from "node:assert/strict";

const source = readFileSync(
  resolve(process.cwd(), "scripts/staging-storage-cleanup-proof.mjs"),
  "utf8",
);

test("Storage proof is staging-only and explicitly rejects production", () => {
  assert.match(source, /EXPECTED_STAGING_REF = "xsiehskfgeoqyazcgauv"/);
  assert.match(source, /PRODUCTION_REF = "qvvicunqcrwpioqnvzxf"/);
  assert.match(source, /STAGING_STORAGE_PROOF_ACK/);
  assert.match(source, /destructiveAck !== "staging-only"/);
});

test("Storage proof covers registration, leases, preservation, deletion scope, and teardown", () => {
  for (const requiredProof of [
    "register_new_building_storage_upload",
    "create-new-building-listing",
    "claim_storage_cleanup_jobs",
    "storage_cleanup_in_progress",
    "invoke_storage_cleanup_cron",
    "project-management",
    "project-media",
    "listing-images",
    "assertZeroResidue",
    "deleteUser",
  ]) {
    assert.ok(source.includes(requiredProof), `Missing proof step: ${requiredProof}`);
  }
});

test("Storage proof guarantees cleanup even when a proof step fails", () => {
  assert.match(source, /try \{[\s\S]*await proveSuccessfulCreation\(\);/);
  assert.match(source, /finally \{[\s\S]*await cleanup\(\);[\s\S]*await assertZeroResidue\(\);/);
});

test("Storage proof rejects a wrong cron secret without mutating the job or object", () => {
  assert.match(source, /wrong-cron-secret/);
  assert.match(source, /wrongSecretResponse\.status !== 401/);
  assert.match(source, /wrong secret leaves the cleanup job and object unchanged/);
});

test("Storage proof exercises stale lease rejection and dead-job requeue", () => {
  assert.match(source, /prepare_storage_cleanup_delete/);
  assert.match(source, /stalePrepare[^]*!== "lost"/);
  assert.match(source, /requeue_storage_cleanup_job/);
  assert.match(source, /status: "dead"/);
  assert.match(source, /stale lease tokens cannot finalize a reclaimed job/);
  assert.match(source, /dead cleanup jobs can be requeued and completed/);
});
