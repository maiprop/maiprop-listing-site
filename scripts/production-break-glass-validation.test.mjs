import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  RELEASE_AUTHORIZATION_ACTIONS,
  breakGlassConfirmation,
  releaseAuthorizationGrant,
  releaseAuthorizationGrantSha256,
  releaseAuthorizationReasonSha256,
  releaseAuthorizationSha256,
  selectReleaseAuthorization,
  validateReleaseAuthorization,
  validateReleaseAuthorizationGrant,
} from "./production-break-glass-validation.mjs";

const sha = "0123456789abcdef0123456789abcdef01234567";
const incidentId = "PERF-BOOTSTRAP-20260826-01";
const reason = "Emergency release to restore production performance safely.";
const now = "2026-08-26T00:00:00.000Z";
const expiresAt = "2026-08-26T03:59:59.000Z";
const reasonSha256 = "3a7e0232d1a54441027669a65abbaf8ba8b9272a06e9205c6d9c1ffa4c9e6067";

const confirmations = [
  ["stripe-readiness", `VERIFY_STRIPE_BREAK_GLASS ${sha} ${incidentId}`],
  ["pages-staging", `PROVISION_STAGING_PAGES_BREAK_GLASS ${sha} ${incidentId}`],
  ["pages-production", `PROVISION_PRODUCTION_PAGES_BREAK_GLASS ${sha} ${incidentId}`],
  ["production-approval", `APPROVE_PRODUCTION_BREAK_GLASS ${sha} ${incidentId}`],
  ["production-deploy", `DEPLOY_PRODUCTION_BREAK_GLASS ${sha} ${incidentId}`],
];

function input(overrides = {}) {
  return {
    action: "production-deploy",
    standardConfirmation: "DEPLOY_PRODUCTION_RELEASE",
    singleAdminBreakGlass: "true",
    incidentId: ` ${incidentId.toLowerCase()} `,
    reason: ` ${reason} `,
    confirmation: `DEPLOY_PRODUCTION_BREAK_GLASS ${sha} ${incidentId}`,
    releaseSha: sha,
    currentMainSha: sha,
    checkoutSha: sha,
    repository: "maiprop/maiprop-listing-site",
    ref: "refs/heads/main",
    eventName: "workflow_dispatch",
    actor: "KRENIOS",
    triggeringActor: "krenios",
    runId: "42",
    runAttempt: "1",
    workflowSha: sha,
    productionReleaseDeployers: "release-bot, krenios",
    breakGlassActor: "krenios",
    breakGlassReleaseSha: sha,
    breakGlassIncidentId: incidentId,
    breakGlassExpiresAt: expiresAt,
    ...overrides,
  };
}

function options(overrides = {}) {
  return { now, ...overrides };
}

function validBreakGlass(overrides = {}) {
  return selectReleaseAuthorization(input(overrides), options());
}

test("exports the five fixed release-authorization actions", () => {
  assert.deepEqual(RELEASE_AUTHORIZATION_ACTIONS, confirmations.map(([action]) => action));
  assert.throws(() => RELEASE_AUTHORIZATION_ACTIONS.push("other"), TypeError);
});

test("uses the exact action-specific break-glass confirmations", () => {
  for (const [action, confirmation] of confirmations) {
    assert.equal(breakGlassConfirmation(action, sha, incidentId), confirmation);
  }
});

test("selects a frozen normalized standard authorization", () => {
  const record = selectReleaseAuthorization(input({
    singleAdminBreakGlass: "false",
    incidentId: "",
    reason: "",
    confirmation: "DEPLOY_PRODUCTION_RELEASE",
    actor: "release-bot",
    triggeringActor: "someone-else",
    runAttempt: "1",
  }), options());

  assert.deepEqual(record, {
    mode: "standard",
    action: "production-deploy",
    actor: "release-bot",
    release_sha: sha,
    workflow_run_id: "42",
    workflow_run_attempt: "1",
  });
  assert.equal(Object.isFrozen(record), true);
  assert.throws(() => { record.action = "pages-staging"; }, TypeError);
});

test("selects a frozen normalized break-glass authorization without the plaintext reason", () => {
  const record = validBreakGlass();
  assert.deepEqual(record, {
    mode: "break_glass",
    action: "production-deploy",
    actor: "krenios",
    release_sha: sha,
    incident_id: incidentId,
    reason_sha256: reasonSha256,
    authorized_expires_at: expiresAt,
    workflow_run_id: "42",
    workflow_run_attempt: "1",
  });
  assert.equal(JSON.stringify(record).includes(reason), false);
  assert.equal(Object.isFrozen(record), true);
});

test("rejects every break-glass context substitution", () => {
  for (const [label, overrides] of [
    ["wrong actor", { actor: "other" }],
    ["substituted triggering actor", { triggeringActor: "other" }],
    ["actor absent from deployers", { productionReleaseDeployers: "release-bot" }],
    ["wrong repository", { repository: "maiprop/other" }],
    ["wrong ref", { ref: "refs/heads/release" }],
    ["wrong event", { eventName: "push" }],
    ["rerun", { runAttempt: "2" }],
  ]) {
    assert.throws(() => validBreakGlass(overrides), Error, label);
  }
});

test("rejects uppercase, malformed, and mismatched release SHAs", () => {
  for (const [label, overrides] of [
    ["uppercase dispatch SHA", { releaseSha: sha.toUpperCase() }],
    ["malformed dispatch SHA", { releaseSha: "abc" }],
    ["configured SHA mismatch", { breakGlassReleaseSha: "f".repeat(40) }],
    ["current main SHA mismatch", { currentMainSha: "f".repeat(40) }],
    ["checkout SHA mismatch", { checkoutSha: "f".repeat(40) }],
    ["workflow SHA mismatch", { workflowSha: "f".repeat(40) }],
  ]) {
    assert.throws(() => validBreakGlass(overrides), Error, label);
  }
});

test("normalizes matching incidents and rejects malformed or mismatched incidents", () => {
  assert.equal(validBreakGlass().incident_id, incidentId);
  for (const [label, overrides] of [
    ["short incident", { incidentId: "ABC-123" }],
    ["malformed incident", { incidentId: "INVALID INCIDENT" }],
    ["configured incident mismatch", { breakGlassIncidentId: "OTHER-BOOTSTRAP-20260826-01" }],
  ]) {
    assert.throws(() => validBreakGlass(overrides), Error, label);
  }
});

test("hashes only a valid trimmed printable single-line reason", () => {
  assert.equal(releaseAuthorizationReasonSha256(` ${reason} `), reasonSha256);
  for (const [label, badReason] of [
    ["short reason", "too short"],
    ["multiline reason", "This is a valid-looking release reason\nwith a hidden second line."],
    ["non-printable reason", "This is a valid-looking release reason\u0007 with a control character."],
  ]) {
    assert.throws(() => validBreakGlass({ reason: badReason }), Error, label);
  }
});

test("rejects missing, expired, invalid, and overlong authorizations", () => {
  for (const [label, expiry] of [
    ["missing", ""],
    ["expired", "2026-08-25T23:59:59.000Z"],
    ["invalid", "2026-08-26 03:00:00+00:00"],
    ["five hour", "2026-08-26T05:00:00.000Z"],
  ]) {
    assert.throws(() => validBreakGlass({ breakGlassExpiresAt: expiry }), Error, label);
  }
});

test("rejects RFC 3339 UTC calendar and clock values before Date normalization", () => {
  for (const [label, expiry, validationNow] of [
    ["hour 24", "2026-08-26T24:00:00Z", "2026-08-26T21:00:00.000Z"],
    ["invalid month", "2026-13-01T00:00:00Z", "2026-12-31T21:00:00.000Z"],
    ["invalid day", "2026-04-31T00:00:00Z", "2026-04-30T21:00:00.000Z"],
    ["non-leap-year February 29", "2026-02-29T00:00:00Z", "2026-02-28T21:00:00.000Z"],
  ]) {
    assert.throws(
      () => selectReleaseAuthorization(input({ breakGlassExpiresAt: expiry }), options({ now: validationNow })),
      Error,
      label,
    );
  }
});

test("requires the exact confirmation without generic, wrong-action, or whitespace variants", () => {
  for (const confirmation of [
    "DEPLOY_PRODUCTION_RELEASE",
    `APPROVE_PRODUCTION_BREAK_GLASS ${sha} ${incidentId}`,
    ` DEPLOY_PRODUCTION_BREAK_GLASS ${sha} ${incidentId}`,
    `DEPLOY_PRODUCTION_BREAK_GLASS ${sha} ${incidentId} `,
    `DEPLOY_PRODUCTION_BREAK_GLASS  ${sha} ${incidentId}`,
  ]) {
    assert.throws(() => validBreakGlass({ confirmation }));
  }
});

test("fails closed for mixed standard and break-glass inputs and invalid booleans", () => {
  for (const overrides of [
    { singleAdminBreakGlass: "false", incidentId },
    { singleAdminBreakGlass: "false", reason },
    { singleAdminBreakGlass: "true", incidentId: "", reason: "" },
    { singleAdminBreakGlass: "TRUE" },
    { singleAdminBreakGlass: true },
  ]) {
    assert.throws(() => selectReleaseAuthorization(input(overrides), options()));
  }
});

test("validates persisted authorization structure, expected tuple, and live expiry", () => {
  const record = validBreakGlass();
  assert.deepEqual(validateReleaseAuthorization(record, record, options()), record);
  assert.throws(() => validateReleaseAuthorization(
    { ...record, reason_sha256: "0".repeat(64) },
    record,
    options(),
  ));
  assert.throws(() => validateReleaseAuthorization(
    { ...record, authorized_expires_at: now },
    record,
    options(),
  ));
  assert.throws(() => validateReleaseAuthorization(
    { ...record, unexpected: true },
    record,
    options(),
  ));
});

test("compares break-glass grants across workflows while allowing action and run identity differences", () => {
  const deployment = validBreakGlass();
  const stripe = validBreakGlass({
    action: "stripe-readiness",
    confirmation: `VERIFY_STRIPE_BREAK_GLASS ${sha} ${incidentId}`,
    runId: "84",
  });
  assert.deepEqual(releaseAuthorizationGrant(deployment), {
    mode: "break_glass",
    actor: "krenios",
    release_sha: sha,
    incident_id: incidentId,
    reason_sha256: reasonSha256,
    authorized_expires_at: expiresAt,
  });
  assert.deepEqual(validateReleaseAuthorizationGrant([deployment, stripe]),
    releaseAuthorizationGrant(deployment));

  for (const override of [
    { actor: "other" },
    { release_sha: "f".repeat(40) },
    { incident_id: "OTHER-BOOTSTRAP-20260826-01" },
    { reason_sha256: "0".repeat(64) },
    { authorized_expires_at: "2026-08-26T03:00:00.000Z" },
  ]) {
    assert.throws(() => validateReleaseAuthorizationGrant([
      deployment,
      { ...stripe, ...override },
    ], options()));
  }
});

test("rejects mixed standard and break-glass evidence", () => {
  const standard = selectReleaseAuthorization(input({
    singleAdminBreakGlass: "false",
    incidentId: "",
    reason: "",
    confirmation: "DEPLOY_PRODUCTION_RELEASE",
  }), options());
  assert.deepEqual(releaseAuthorizationGrant(standard), { mode: "standard" });
  assert.throws(() => validateReleaseAuthorizationGrant([standard, validBreakGlass()], options()));
});

test("uses fixed canonical UTF-8 SHA-256 values for authorization and grant evidence", () => {
  const record = validBreakGlass();
  assert.equal(
    releaseAuthorizationSha256(record),
    "e42bd0bf403e418aeb5948c83cc40b4a0f007b959bca899fdb1d2e41602e74ce",
  );
  assert.equal(
    releaseAuthorizationGrantSha256(record),
    "187d10cc885cfd446d685d76b662e4f4deed755e404eee7bfdba251b89d97b7b",
  );
});

test("CLI writes normalized non-sensitive evidence without printing the reason", () => {
  const root = mkdtempSync(join(tmpdir(), "maiprop-break-glass-"));
  try {
    const out = join(root, "release-authorization.json");
    const githubOutput = join(root, "github-output.txt");
    const env = {
      ...process.env,
      RELEASE_AUTHORIZATION_ACTION: "production-deploy",
      RELEASE_STANDARD_CONFIRMATION: "DEPLOY_PRODUCTION_RELEASE",
      RELEASE_SINGLE_ADMIN_BREAK_GLASS: "true",
      RELEASE_INCIDENT_ID: incidentId,
      RELEASE_REASON: reason,
      RELEASE_CONFIRM: `DEPLOY_PRODUCTION_BREAK_GLASS ${sha} ${incidentId}`,
      RELEASE_SHA: sha,
      RELEASE_CURRENT_MAIN_SHA: sha,
      RELEASE_CHECKOUT_SHA: sha,
      GITHUB_REPOSITORY: "maiprop/maiprop-listing-site",
      GITHUB_REF: "refs/heads/main",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_ACTOR: "krenios",
      GITHUB_TRIGGERING_ACTOR: "krenios",
      GITHUB_RUN_ID: "42",
      GITHUB_RUN_ATTEMPT: "1",
      GITHUB_WORKFLOW_SHA: sha,
      PRODUCTION_RELEASE_DEPLOYERS: "krenios",
      PRODUCTION_BREAK_GLASS_ACTOR: "krenios",
      PRODUCTION_BREAK_GLASS_RELEASE_SHA: sha,
      PRODUCTION_BREAK_GLASS_INCIDENT_ID: incidentId,
      PRODUCTION_BREAK_GLASS_EXPIRES_AT: new Date(Date.now() + (3 * 60 * 60 * 1000)).toISOString(),
    };
    const result = spawnSync(process.execPath, [
      "scripts/production-break-glass-validation.mjs",
      "validate-workflow",
      "--out", out,
      "--github-output", githubOutput,
    ], { cwd: process.cwd(), env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(`${result.stdout}${result.stderr}`.includes(reason), false);
    assert.equal(readFileSync(out, "utf8").includes(reason), false);
    assert.match(readFileSync(githubOutput, "utf8"), /mode=break_glass/);
    assert.match(readFileSync(githubOutput, "utf8"), new RegExp(`reason_sha256=${reasonSha256}`));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
