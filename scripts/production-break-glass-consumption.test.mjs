import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const hasVitestRuntime = typeof globalThis.it === "function";
const testRuntime = hasVitestRuntime
  ? globalThis
  : await import(/* @vite-ignore */ ["node", "test"].join(":"));
const test = hasVitestRuntime ? globalThis.it : testRuntime.test;

import {
  consumptionArtifactName,
  consumptionTuple,
  createConsumptionReceipt,
  validateConsumptionReceipt,
} from "./production-break-glass-consumption.mjs";

const releaseSha = "0123456789abcdef0123456789abcdef01234567";
const incidentId = "PERF-BOOTSTRAP-20260826-01";
const reasonSha256 = "3a7e0232d1a54441027669a65abbaf8ba8b9272a06e9205c6d9c1ffa4c9e6067";
const repository = "maiprop/maiprop-listing-site";
const workflowRef =
  "maiprop/maiprop-listing-site/.github/workflows/provision-cloudflare-pages-runtime.yml@refs/heads/main";
const runId = "42";
const consumedAt = "2026-08-26T08:00:00.000Z";
const expiresAt = "2026-08-26T10:00:00.000Z";
const nonce = "9".repeat(64);

function authorization(overrides = {}) {
  return {
    mode: "break_glass",
    action: "pages-staging",
    actor: "krenios",
    release_sha: releaseSha,
    incident_id: incidentId,
    reason_sha256: reasonSha256,
    authorized_expires_at: expiresAt,
    workflow_run_id: runId,
    workflow_run_attempt: "1",
    ...overrides,
  };
}

function receipt(overrides = {}) {
  return {
    schema_version: 1,
    evidence_type: "maiprop-production-break-glass-consumption",
    repository,
    workflow_ref: workflowRef,
    workflow_sha: releaseSha,
    workflow_run_id: runId,
    workflow_run_attempt: "1",
    consumed_at: consumedAt,
    nonce,
    authorization: authorization(),
    ...overrides,
  };
}

function expected(overrides = {}) {
  return {
    authorization: authorization(),
    action: "pages-staging",
    repository,
    workflowRef,
    workflowSha: releaseSha,
    runId,
    runAttempt: "1",
    ...overrides,
  };
}

test("uses exact deterministic artifact names for the three state-changing actions", () => {
  assert.equal(
    consumptionArtifactName({
      action: "pages-staging",
      releaseSha,
      incidentId,
    }),
    "production-break-glass-consumed-pages-staging-0123456789abcdef0123456789abcdef01234567-PERF-BOOTSTRAP-20260826-01",
  );
  assert.equal(
    consumptionArtifactName({
      action: "pages-production",
      releaseSha,
      incidentId,
    }),
    "production-break-glass-consumed-pages-production-0123456789abcdef0123456789abcdef01234567-PERF-BOOTSTRAP-20260826-01",
  );
  assert.equal(
    consumptionArtifactName({
      action: "production-deploy",
      releaseSha: "0123456789abcdef0123456789abcdef01234567",
      incidentId: "PERF-BOOTSTRAP-20260826-01",
    }),
    "production-break-glass-consumed-production-deploy-0123456789abcdef0123456789abcdef01234567-PERF-BOOTSTRAP-20260826-01",
  );
});

test("rejects read-only, approval, unknown, malformed, and mixed artifact-name inputs", () => {
  for (const action of [
    "stripe-readiness",
    "production-approval",
    "unknown-action",
    "",
  ]) {
    assert.throws(
      () => consumptionArtifactName({ action, releaseSha, incidentId }),
      /action/i,
      action,
    );
  }
  assert.throws(() => consumptionArtifactName({
    action: "pages-staging",
    releaseSha: releaseSha.toUpperCase(),
    incidentId,
  }), /lowercase|SHA/i);
  assert.throws(() => consumptionArtifactName({
    action: "pages-staging",
    releaseSha,
    incidentId: "bad incident",
  }), /incident/i);
  assert.throws(() => consumptionArtifactName({
    action: "pages-staging",
    releaseSha,
    incidentId,
    approvalAction: "production-approval",
  }), /unsupported|fields|shape/i);
});

test("creates the exact frozen schema-version-1 receipt from a trusted run tuple", () => {
  const created = createConsumptionReceipt({
    authorization: authorization(),
    repository,
    workflowRef,
    workflowSha: releaseSha,
    runId,
    runAttempt: "1",
    consumedAt,
    nonce,
  });

  assert.deepEqual(created, {
    schema_version: 1,
    evidence_type: "maiprop-production-break-glass-consumption",
    repository: "maiprop/maiprop-listing-site",
    workflow_ref:
      "maiprop/maiprop-listing-site/.github/workflows/provision-cloudflare-pages-runtime.yml@refs/heads/main",
    workflow_sha: "0123456789abcdef0123456789abcdef01234567",
    workflow_run_id: "42",
    workflow_run_attempt: "1",
    consumed_at: "2026-08-26T08:00:00.000Z",
    nonce: "9999999999999999999999999999999999999999999999999999999999999999",
    authorization: {
      mode: "break_glass",
      action: "pages-staging",
      actor: "krenios",
      release_sha: "0123456789abcdef0123456789abcdef01234567",
      incident_id: "PERF-BOOTSTRAP-20260826-01",
      reason_sha256: "3a7e0232d1a54441027669a65abbaf8ba8b9272a06e9205c6d9c1ffa4c9e6067",
      authorized_expires_at: "2026-08-26T10:00:00.000Z",
      workflow_run_id: "42",
      workflow_run_attempt: "1",
    },
  });
  assert.equal(Object.isFrozen(created), true);
  assert.equal(Object.isFrozen(created.authorization), true);
});

test("creation rejects unsupported modes, loose run identity, invalid nonces, and extra inputs", () => {
  const base = {
    authorization: authorization(),
    repository,
    workflowRef,
    workflowSha: releaseSha,
    runId,
    runAttempt: "1",
    consumedAt,
    nonce,
  };
  for (const [label, override] of [
    ["standard mode", { authorization: { mode: "standard" } }],
    ["read-only action", { authorization: authorization({ action: "stripe-readiness" }) }],
    ["approval action", { authorization: authorization({ action: "production-approval" }) }],
    ["wrong run", { runId: "43" }],
    ["attempt two", { runAttempt: "2" }],
    ["uppercase nonce", { nonce: "A".repeat(64) }],
    ["short nonce", { nonce: "9".repeat(63) }],
    ["extra field", { approval: true }],
  ]) {
    assert.throws(
      () => createConsumptionReceipt({ ...base, ...override }),
      Error,
      label,
    );
  }
});

test("validates the exact receipt and revalidates every nested authorization field", () => {
  const validated = validateConsumptionReceipt(
    receipt(),
    expected(),
    { now: consumedAt },
  );
  assert.deepEqual(validated, receipt());
  assert.equal(Object.isFrozen(validated), true);
  assert.equal(Object.isFrozen(validated.authorization), true);

  for (const [label, authorizationOverride] of [
    ["wrong action", { action: "pages-production" }],
    ["read-only action", { action: "stripe-readiness" }],
    ["wrong SHA", { release_sha: "f".repeat(40) }],
    ["wrong incident", { incident_id: "OTHER-BOOTSTRAP-20260826-01" }],
    ["wrong actor", { actor: "other" }],
    ["non-exact uppercase actor", { actor: "KRENIOS" }],
    ["wrong reason hash", { reason_sha256: "0".repeat(64) }],
    ["wrong authorization run", { workflow_run_id: "43" }],
    ["authorization attempt two", { workflow_run_attempt: "2" }],
    ["extra authorization field", { reason: "plaintext reason must not persist" }],
  ]) {
    assert.throws(
      () => validateConsumptionReceipt(
        receipt({ authorization: authorization(authorizationOverride) }),
        expected(),
        { now: consumedAt },
      ),
      Error,
      label,
    );
  }
});

test("rejects wrong receipt repository, workflow, run, attempt, nonce, and strict shape", () => {
  for (const [label, receiptOverride] of [
    ["wrong repository", { repository: "maiprop/other" }],
    ["uppercase repository", { repository: "MAIPROP/MAIPROP-LISTING-SITE" }],
    ["wrong workflow ref", {
      workflow_ref:
        "maiprop/maiprop-listing-site/.github/workflows/deploy-production-release.yml@refs/heads/main",
    }],
    ["wrong workflow SHA", { workflow_sha: "f".repeat(40) }],
    ["uppercase workflow SHA", { workflow_sha: releaseSha.toUpperCase() }],
    ["wrong receipt run", { workflow_run_id: "43" }],
    ["receipt attempt two", { workflow_run_attempt: "2" }],
    ["numeric attempt", { workflow_run_attempt: 1 }],
    ["uppercase nonce", { nonce: "A".repeat(64) }],
    ["short nonce", { nonce: "9".repeat(63) }],
    ["wrong schema", { schema_version: 2 }],
    ["wrong evidence", { evidence_type: "other" }],
    ["extra receipt field", { reason: "plaintext reason must not persist" }],
  ]) {
    assert.throws(
      () => validateConsumptionReceipt(receipt(receiptOverride), expected(), { now: consumedAt }),
      Error,
      label,
    );
  }
  const missing = receipt();
  delete missing.workflow_ref;
  assert.throws(
    () => validateConsumptionReceipt(missing, expected(), { now: consumedAt }),
    /missing|unsupported|fields|shape/i,
  );
});

test("requires strict RFC 3339 UTC consumed time and rejects future trusted time", () => {
  for (const [label, value] of [
    ["offset", "2026-08-26T08:00:00+00:00"],
    ["space", "2026-08-26 08:00:00Z"],
    ["too much precision", "2026-08-26T08:00:00.0000Z"],
    ["invalid calendar day", "2026-04-31T08:00:00Z"],
    ["hour 24", "2026-08-26T24:00:00Z"],
  ]) {
    assert.throws(
      () => validateConsumptionReceipt(
        receipt({ consumed_at: value }),
        expected(),
        { now: consumedAt },
      ),
      /consumed|time|timestamp/i,
      label,
    );
  }
  assert.throws(
    () => validateConsumptionReceipt(
      receipt({ consumed_at: "2026-08-26T08:00:00.001Z" }),
      expected(),
      { now: consumedAt },
    ),
    /future/i,
  );
});

test("enforces exclusive authorization expiry and explicit historical verification", () => {
  assert.throws(
    () => validateConsumptionReceipt(
      receipt({ consumed_at: expiresAt }),
      expected(),
      { now: "2026-08-26T11:00:00.000Z", allowHistoricalExpiry: true },
    ),
    /before|expiry|expired/i,
  );
  assert.throws(
    () => validateConsumptionReceipt(
      receipt({ consumed_at: "2026-08-26T10:00:00.001Z" }),
      expected(),
      { now: "2026-08-26T11:00:00.000Z", allowHistoricalExpiry: true },
    ),
    /before|expiry|expired/i,
  );
  assert.throws(
    () => validateConsumptionReceipt(
      receipt(),
      expected(),
      { now: "2026-08-26T11:00:00.000Z" },
    ),
    /expiry|future|expired/i,
  );
  assert.deepEqual(
    validateConsumptionReceipt(
      receipt(),
      expected(),
      { now: "2026-08-26T11:00:00.000Z", allowHistoricalExpiry: true },
    ),
    receipt(),
  );
});

test("returns the exact eight-field immutable consumption tuple", () => {
  const tuple = consumptionTuple({
    receipt: receipt(),
    payloadArtifact: {
      artifactId: "101",
      artifactDigest: "a".repeat(64),
    },
    bindingArtifact: {
      artifactId: "102",
    },
    payloadSha256: "b".repeat(64),
  });
  assert.deepEqual(tuple, {
    artifact_id: "101",
    artifact_digest: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    binding_artifact_id: "102",
    payload_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    action: "pages-staging",
    incident_id: "PERF-BOOTSTRAP-20260826-01",
    release_sha: "0123456789abcdef0123456789abcdef01234567",
    parent_run_id: "42",
  });
  assert.deepEqual(Object.keys(tuple), [
    "artifact_id",
    "artifact_digest",
    "binding_artifact_id",
    "payload_sha256",
    "action",
    "incident_id",
    "release_sha",
    "parent_run_id",
  ]);
  assert.equal(Object.isFrozen(tuple), true);
});

test("rejects malformed or extra artifact identities and non-exact tuple hashes", () => {
  const base = {
    receipt: receipt(),
    payloadArtifact: { artifactId: "101", artifactDigest: "a".repeat(64) },
    bindingArtifact: { artifactId: "102" },
    payloadSha256: "b".repeat(64),
  };
  for (const [label, override] of [
    ["numeric payload ID", {
      payloadArtifact: { artifactId: 101, artifactDigest: "a".repeat(64) },
    }],
    ["zero payload ID", {
      payloadArtifact: { artifactId: "0", artifactDigest: "a".repeat(64) },
    }],
    ["uppercase artifact digest", {
      payloadArtifact: { artifactId: "101", artifactDigest: "A".repeat(64) },
    }],
    ["prefixed artifact digest", {
      payloadArtifact: { artifactId: "101", artifactDigest: `sha256:${"a".repeat(64)}` },
    }],
    ["extra payload artifact field", {
      payloadArtifact: {
        artifactId: "101",
        artifactDigest: "a".repeat(64),
        artifactName: "unexpected",
      },
    }],
    ["numeric binding ID", { bindingArtifact: { artifactId: 102 } }],
    ["extra binding artifact field", {
      bindingArtifact: { artifactId: "102", artifactDigest: "c".repeat(64) },
    }],
    ["uppercase payload hash", { payloadSha256: "B".repeat(64) }],
    ["extra tuple input", { authorization: authorization() }],
  ]) {
    assert.throws(
      () => consumptionTuple({ ...base, ...override }),
      Error,
      label,
    );
  }
});

test("CLI creates, names, and verifies an exact receipt without exposing plaintext reason", () => {
  const root = mkdtempSync(join(tmpdir(), "maiprop-consumption-"));
  const plaintextReason = "Emergency production reason that must never be persisted.";
  try {
    const authorizationFile = join(root, "release-authorization.json");
    const receiptFile = join(root, "production-break-glass-consumption.json");
    const liveAuthorization = authorization({
      authorized_expires_at: new Date(Date.now() + (3 * 60 * 60 * 1000)).toISOString(),
    });
    writeFileSync(authorizationFile, `${JSON.stringify(liveAuthorization)}\n`, "utf8");
    const env = {
      ...process.env,
      RELEASE_REASON: plaintextReason,
      GITHUB_REPOSITORY: repository,
      GITHUB_WORKFLOW_REF: workflowRef,
      GITHUB_WORKFLOW_SHA: releaseSha,
      GITHUB_RUN_ID: runId,
      GITHUB_RUN_ATTEMPT: "1",
    };

    const created = spawnSync(process.execPath, [
      "scripts/production-break-glass-consumption.mjs",
      "create",
      "--authorization", authorizationFile,
      "--out", receiptFile,
    ], { cwd: process.cwd(), env, encoding: "utf8" });
    assert.equal(created.status, 0, created.stderr);
    assert.equal(`${created.stdout}${created.stderr}`.includes(plaintextReason), false);
    const createdReceipt = JSON.parse(readFileSync(receiptFile, "utf8"));
    assert.equal(JSON.stringify(createdReceipt).includes(plaintextReason), false);
    assert.equal(createdReceipt.repository, repository);
    assert.equal(createdReceipt.workflow_ref, workflowRef);
    assert.equal(createdReceipt.workflow_sha, releaseSha);
    assert.equal(createdReceipt.workflow_run_id, runId);
    assert.equal(createdReceipt.workflow_run_attempt, "1");
    assert.match(createdReceipt.consumed_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.match(createdReceipt.nonce, /^[0-9a-f]{64}$/);

    const named = spawnSync(process.execPath, [
      "scripts/production-break-glass-consumption.mjs",
      "name",
      "--authorization", authorizationFile,
    ], { cwd: process.cwd(), env, encoding: "utf8" });
    assert.equal(named.status, 0, named.stderr);
    assert.equal(
      named.stdout.trim(),
      "production-break-glass-consumed-pages-staging-0123456789abcdef0123456789abcdef01234567-PERF-BOOTSTRAP-20260826-01",
    );
    assert.equal(`${named.stdout}${named.stderr}`.includes(plaintextReason), false);

    const verified = spawnSync(process.execPath, [
      "scripts/production-break-glass-consumption.mjs",
      "verify",
      "--file", receiptFile,
      "--authorization", authorizationFile,
      "--action", "pages-staging",
    ], { cwd: process.cwd(), env, encoding: "utf8" });
    assert.equal(verified.status, 0, verified.stderr);
    assert.equal(`${verified.stdout}${verified.stderr}`.includes(plaintextReason), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI create and verify fail closed on run, action, or evidence mismatch", () => {
  const root = mkdtempSync(join(tmpdir(), "maiprop-consumption-failure-"));
  try {
    const authorizationFile = join(root, "release-authorization.json");
    const receiptFile = join(root, "production-break-glass-consumption.json");
    const failedOut = join(root, "must-not-exist.json");
    const liveAuthorization = authorization({
      authorized_expires_at: new Date(Date.now() + (3 * 60 * 60 * 1000)).toISOString(),
    });
    writeFileSync(authorizationFile, `${JSON.stringify(liveAuthorization)}\n`, "utf8");
    const env = {
      ...process.env,
      GITHUB_REPOSITORY: repository,
      GITHUB_WORKFLOW_REF: workflowRef,
      GITHUB_WORKFLOW_SHA: releaseSha,
      GITHUB_RUN_ID: runId,
      GITHUB_RUN_ATTEMPT: "1",
    };
    const created = spawnSync(process.execPath, [
      "scripts/production-break-glass-consumption.mjs",
      "create",
      "--authorization", authorizationFile,
      "--out", receiptFile,
    ], { cwd: process.cwd(), env, encoding: "utf8" });
    assert.equal(created.status, 0, created.stderr);

    const wrongAction = spawnSync(process.execPath, [
      "scripts/production-break-glass-consumption.mjs",
      "verify",
      "--file", receiptFile,
      "--authorization", authorizationFile,
      "--action", "pages-production",
    ], { cwd: process.cwd(), env, encoding: "utf8" });
    assert.notEqual(wrongAction.status, 0);

    const attemptTwo = spawnSync(process.execPath, [
      "scripts/production-break-glass-consumption.mjs",
      "create",
      "--authorization", authorizationFile,
      "--out", failedOut,
    ], {
      cwd: process.cwd(),
      env: { ...env, GITHUB_RUN_ATTEMPT: "2" },
      encoding: "utf8",
    });
    assert.notEqual(attemptTwo.status, 0);
    assert.equal(existsSync(failedOut), false);

    const tampered = JSON.parse(readFileSync(receiptFile, "utf8"));
    tampered.nonce = "A".repeat(64);
    writeFileSync(receiptFile, `${JSON.stringify(tampered)}\n`, "utf8");
    const invalidEvidence = spawnSync(process.execPath, [
      "scripts/production-break-glass-consumption.mjs",
      "verify",
      "--file", receiptFile,
      "--authorization", authorizationFile,
      "--action", "pages-staging",
    ], { cwd: process.cwd(), env, encoding: "utf8" });
    assert.notEqual(invalidEvidence.status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
