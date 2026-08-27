#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { validateReleaseAuthorization } from "./production-break-glass-validation.mjs";

const STATE_CHANGING_ACTIONS = Object.freeze([
  "pages-staging",
  "pages-production",
  "production-deploy",
]);
const REPOSITORY = "maiprop/maiprop-listing-site";
const EVIDENCE_TYPE = "maiprop-production-break-glass-consumption";
const FULL_LOWERCASE_SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const INCIDENT_ID = /^[A-Z0-9][A-Z0-9._-]{7,63}$/;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const WORKFLOW_REF =
  /^maiprop\/maiprop-listing-site\/\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml@refs\/heads\/main$/;

function fail(message) {
  throw new Error(`Break-glass consumption validation failed: ${message}`);
}

function isPlainObject(value) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function requirePlainObject(value, label) {
  if (!isPlainObject(value)) fail(`${label} must be an object.`);
  return value;
}

function requireExactKeys(value, keys, label) {
  requirePlainObject(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...keys].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    fail(`${label} has unsupported or missing fields.`);
  }
}

function requireStateChangingAction(value) {
  if (typeof value !== "string" || !STATE_CHANGING_ACTIONS.includes(value)) {
    fail("action must identify a state-changing break-glass action.");
  }
  return value;
}

function requireLowercaseSha(value, label) {
  if (typeof value !== "string" || !FULL_LOWERCASE_SHA.test(value)) {
    fail(`${label} must be an exact lowercase full 40-character Git SHA.`);
  }
  return value;
}

function requireSha256(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    fail(`${label} must be an exact lowercase SHA-256 value.`);
  }
  return value;
}

function requirePositiveInteger(value, label) {
  if (typeof value !== "string" || !POSITIVE_INTEGER.test(value)) {
    fail(`${label} must be a positive integer string.`);
  }
  return value;
}

function requireAttemptOne(value) {
  if (value !== "1") fail("workflow run attempt must be exactly 1.");
  return value;
}

function requireRepository(value) {
  if (value !== REPOSITORY) fail("repository is not authorized.");
  return value;
}

function requireWorkflowRef(value) {
  if (typeof value !== "string" || !WORKFLOW_REF.test(value)) {
    fail("workflow ref must identify a main-branch repository workflow.");
  }
  return value;
}

function requireIncidentId(value) {
  if (typeof value !== "string" || !INCIDENT_ID.test(value)) {
    fail("incident ID must use the normalized break-glass format.");
  }
  return value;
}

function parseStrictUtc(value, label) {
  if (typeof value !== "string" || !RFC3339_UTC.test(value)) {
    fail(`${label} must be a strict RFC 3339 UTC timestamp.`);
  }
  const components =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/.exec(value);
  const parsed = new Date(value);
  if (
    !components ||
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== Number(components[1]) ||
    parsed.getUTCMonth() + 1 !== Number(components[2]) ||
    parsed.getUTCDate() !== Number(components[3]) ||
    parsed.getUTCHours() !== Number(components[4]) ||
    parsed.getUTCMinutes() !== Number(components[5]) ||
    parsed.getUTCSeconds() !== Number(components[6]) ||
    parsed.getUTCMilliseconds() !== Number((components[7] ?? "").padEnd(3, "0"))
  ) {
    fail(`${label} is invalid.`);
  }
  return parsed;
}

function parseTrustedNow(value) {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(parsed.getTime())) fail("trusted validation time is invalid.");
  return parsed;
}

function requireNormalizedAuthorization(record, expected, options) {
  const normalized = validateReleaseAuthorization(record, expected, options);
  for (const [key, value] of Object.entries(normalized)) {
    if (record[key] !== value) {
      fail(`authorization ${key} must use its exact normalized value.`);
    }
  }
  return normalized;
}

function freezeReceipt(record) {
  return Object.freeze({
    ...record,
    authorization: Object.freeze({ ...record.authorization }),
  });
}

export function consumptionArtifactName(input) {
  requireExactKeys(input, ["action", "releaseSha", "incidentId"], "artifact-name input");
  const action = requireStateChangingAction(input.action);
  const releaseSha = requireLowercaseSha(input.releaseSha, "release SHA");
  const incidentId = requireIncidentId(input.incidentId);
  return `production-break-glass-consumed-${action}-${releaseSha}-${incidentId}`;
}

export function createConsumptionReceipt(input) {
  requireExactKeys(input, [
    "authorization",
    "repository",
    "workflowRef",
    "workflowSha",
    "runId",
    "runAttempt",
    "consumedAt",
    "nonce",
  ], "receipt creation input");
  const repository = requireRepository(input.repository);
  const workflowRef = requireWorkflowRef(input.workflowRef);
  const workflowSha = requireLowercaseSha(input.workflowSha, "workflow SHA");
  const runId = requirePositiveInteger(input.runId, "workflow run ID");
  const runAttempt = requireAttemptOne(input.runAttempt);
  const consumedAt = parseStrictUtc(input.consumedAt, "consumed time");
  const nonce = requireSha256(input.nonce, "nonce");
  const action = requireStateChangingAction(input.authorization?.action);
  const authorization = requireNormalizedAuthorization(input.authorization, {
    mode: "break_glass",
    action,
    releaseSha: workflowSha,
    runId,
    runAttempt,
  }, { now: consumedAt });
  if (consumedAt.getTime() >= Date.parse(authorization.authorized_expires_at)) {
    fail("consumed time must be before authorization expiry.");
  }
  return freezeReceipt({
    schema_version: 1,
    evidence_type: EVIDENCE_TYPE,
    repository,
    workflow_ref: workflowRef,
    workflow_sha: workflowSha,
    workflow_run_id: runId,
    workflow_run_attempt: runAttempt,
    consumed_at: consumedAt.toISOString(),
    nonce,
    authorization,
  });
}

export function validateConsumptionReceipt(receipt, expected, options = {}) {
  requireExactKeys(options, Object.hasOwn(options, "now")
    ? (Object.hasOwn(options, "allowHistoricalExpiry")
      ? ["now", "allowHistoricalExpiry"]
      : ["now"])
    : (Object.hasOwn(options, "allowHistoricalExpiry")
      ? ["allowHistoricalExpiry"]
      : []), "receipt validation options");
  if (
    Object.hasOwn(options, "allowHistoricalExpiry") &&
    options.allowHistoricalExpiry !== true
  ) {
    fail("allowHistoricalExpiry must be the literal boolean true when supplied.");
  }
  requireExactKeys(expected, [
    "authorization",
    "action",
    "repository",
    "workflowRef",
    "workflowSha",
    "runId",
    "runAttempt",
  ], "expected receipt context");
  requireExactKeys(receipt, [
    "schema_version",
    "evidence_type",
    "repository",
    "workflow_ref",
    "workflow_sha",
    "workflow_run_id",
    "workflow_run_attempt",
    "consumed_at",
    "nonce",
    "authorization",
  ], "consumption receipt");
  if (receipt.schema_version !== 1 || receipt.evidence_type !== EVIDENCE_TYPE) {
    fail("consumption receipt schema or evidence type is unsupported.");
  }

  const action = requireStateChangingAction(expected.action);
  const repository = requireRepository(expected.repository);
  const workflowRef = requireWorkflowRef(expected.workflowRef);
  const workflowSha = requireLowercaseSha(expected.workflowSha, "expected workflow SHA");
  const runId = requirePositiveInteger(expected.runId, "expected workflow run ID");
  const runAttempt = requireAttemptOne(expected.runAttempt);
  const consumedAt = parseStrictUtc(receipt.consumed_at, "consumed time");
  if (Object.hasOwn(options, "now")) {
    const now = parseTrustedNow(options.now);
    if (consumedAt.getTime() > now.getTime()) {
      fail("consumed time cannot be in the future relative to trusted validation time.");
    }
  }
  const authorizationOptions = {
    ...(Object.hasOwn(options, "now") ? { now: options.now } : {}),
    ...(options.allowHistoricalExpiry === true ? { allowHistoricalExpiry: true } : {}),
  };
  const expectedAuthorization = requireNormalizedAuthorization(
    expected.authorization,
    {
      mode: "break_glass",
      action,
      releaseSha: workflowSha,
      runId,
      runAttempt,
    },
    authorizationOptions,
  );
  const authorization = requireNormalizedAuthorization(
    receipt.authorization,
    expectedAuthorization,
    authorizationOptions,
  );

  if (
    receipt.repository !== repository ||
    requireRepository(receipt.repository) !== repository ||
    receipt.workflow_ref !== workflowRef ||
    requireWorkflowRef(receipt.workflow_ref) !== workflowRef ||
    receipt.workflow_sha !== workflowSha ||
    requireLowercaseSha(receipt.workflow_sha, "receipt workflow SHA") !== workflowSha ||
    receipt.workflow_run_id !== runId ||
    requirePositiveInteger(receipt.workflow_run_id, "receipt workflow run ID") !== runId ||
    receipt.workflow_run_attempt !== runAttempt ||
    requireAttemptOne(receipt.workflow_run_attempt) !== runAttempt
  ) {
    fail("receipt run context does not match expected evidence.");
  }
  const nonce = requireSha256(receipt.nonce, "receipt nonce");
  if (consumedAt.getTime() >= Date.parse(authorization.authorized_expires_at)) {
    fail("consumed time must be before authorization expiry.");
  }

  return freezeReceipt({
    schema_version: 1,
    evidence_type: EVIDENCE_TYPE,
    repository,
    workflow_ref: workflowRef,
    workflow_sha: workflowSha,
    workflow_run_id: runId,
    workflow_run_attempt: runAttempt,
    consumed_at: consumedAt.toISOString(),
    nonce,
    authorization,
  });
}

export function consumptionTuple(input) {
  requireExactKeys(input, [
    "receipt",
    "payloadArtifact",
    "bindingArtifact",
    "payloadSha256",
  ], "consumption tuple input");
  requireExactKeys(
    input.payloadArtifact,
    ["artifactId", "artifactDigest"],
    "payload artifact",
  );
  requireExactKeys(input.bindingArtifact, ["artifactId"], "binding artifact");
  const receipt = requirePlainObject(input.receipt, "consumption receipt");
  const authorization = requirePlainObject(receipt.authorization, "receipt authorization");
  const validatedReceipt = validateConsumptionReceipt(receipt, {
    authorization,
    action: authorization.action,
    repository: receipt.repository,
    workflowRef: receipt.workflow_ref,
    workflowSha: receipt.workflow_sha,
    runId: receipt.workflow_run_id,
    runAttempt: receipt.workflow_run_attempt,
  }, { allowHistoricalExpiry: true });
  return Object.freeze({
    artifact_id: requirePositiveInteger(
      input.payloadArtifact.artifactId,
      "payload artifact ID",
    ),
    artifact_digest: requireSha256(
      input.payloadArtifact.artifactDigest,
      "payload artifact digest",
    ),
    binding_artifact_id: requirePositiveInteger(
      input.bindingArtifact.artifactId,
      "binding artifact ID",
    ),
    payload_sha256: requireSha256(input.payloadSha256, "payload SHA-256"),
    action: validatedReceipt.authorization.action,
    incident_id: validatedReceipt.authorization.incident_id,
    release_sha: validatedReceipt.authorization.release_sha,
    parent_run_id: validatedReceipt.workflow_run_id,
  });
}

function parseArguments(values, allowed) {
  if (values.length % 2 !== 0) fail("CLI arguments must use --name value pairs.");
  const parsed = {};
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index];
    const value = values[index + 1];
    if (!flag?.startsWith("--") || value === undefined) {
      fail("CLI arguments must use --name value pairs.");
    }
    const name = flag.slice(2);
    if (!allowed.includes(name) || Object.hasOwn(parsed, name)) {
      fail("CLI argument is unsupported or duplicated.");
    }
    parsed[name] = value;
  }
  if (Object.keys(parsed).length !== allowed.length || allowed.some((name) => !parsed[name])) {
    fail("CLI arguments are missing.");
  }
  return parsed;
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch {
    fail(`${label} JSON is invalid.`);
  }
}

function requiredEnvironment(name) {
  if (!Object.hasOwn(process.env, name) || process.env[name] === "") {
    fail(`trusted environment variable ${name} is required.`);
  }
  return process.env[name];
}

function trustedWorkflowContext() {
  return {
    repository: requiredEnvironment("GITHUB_REPOSITORY"),
    workflowRef: requiredEnvironment("GITHUB_WORKFLOW_REF"),
    workflowSha: requiredEnvironment("GITHUB_WORKFLOW_SHA"),
    runId: requiredEnvironment("GITHUB_RUN_ID"),
    runAttempt: requiredEnvironment("GITHUB_RUN_ATTEMPT"),
  };
}

function validatedCliAuthorization(path, action, context, now) {
  const record = readJson(path, "authorization");
  return requireNormalizedAuthorization(record, {
    mode: "break_glass",
    action,
    releaseSha: context.workflowSha,
    runId: context.runId,
    runAttempt: context.runAttempt,
  }, { now });
}

async function main() {
  const command = process.argv[2];
  if (command === "create") {
    const args = parseArguments(process.argv.slice(3), ["authorization", "out"]);
    if (resolve(args.authorization) === resolve(args.out)) {
      fail("authorization and output paths must differ.");
    }
    const context = trustedWorkflowContext();
    const now = new Date();
    const authorization = validatedCliAuthorization(
      args.authorization,
      readJson(args.authorization, "authorization")?.action,
      context,
      now,
    );
    const receipt = createConsumptionReceipt({
      authorization,
      ...context,
      consumedAt: now.toISOString(),
      nonce: randomBytes(32).toString("hex"),
    });
    writeFileSync(resolve(args.out), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    return;
  }
  if (command === "verify") {
    const args = parseArguments(process.argv.slice(3), ["file", "authorization", "action"]);
    const context = trustedWorkflowContext();
    const now = new Date();
    const authorization = validatedCliAuthorization(args.authorization, args.action, context, now);
    validateConsumptionReceipt(readJson(args.file, "receipt"), {
      authorization,
      action: args.action,
      ...context,
    }, { now });
    return;
  }
  if (command === "name") {
    const args = parseArguments(process.argv.slice(3), ["authorization"]);
    const record = readJson(args.authorization, "authorization");
    const action = requireStateChangingAction(record?.action);
    const authorization = requireNormalizedAuthorization(record, {
      mode: "break_glass",
      action,
    }, { now: new Date() });
    process.stdout.write(`${consumptionArtifactName({
      action: authorization.action,
      releaseSha: authorization.release_sha,
      incidentId: authorization.incident_id,
    })}\n`);
    return;
  }
  fail("usage: production-break-glass-consumption.mjs create|verify|name.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
