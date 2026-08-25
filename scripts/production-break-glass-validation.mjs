#!/usr/bin/env node
import { createHash } from "node:crypto";
import { appendFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const RELEASE_AUTHORIZATION_ACTIONS = Object.freeze([
  "stripe-readiness",
  "pages-staging",
  "pages-production",
  "production-approval",
  "production-deploy",
]);

const ACTION_CONFIRMATION_PREFIXES = Object.freeze({
  "stripe-readiness": "VERIFY_STRIPE_BREAK_GLASS",
  "pages-staging": "PROVISION_STAGING_PAGES_BREAK_GLASS",
  "pages-production": "PROVISION_PRODUCTION_PAGES_BREAK_GLASS",
  "production-approval": "APPROVE_PRODUCTION_BREAK_GLASS",
  "production-deploy": "DEPLOY_PRODUCTION_BREAK_GLASS",
});
const REPOSITORY = "maiprop/maiprop-listing-site";
const MAIN_REF = "refs/heads/main";
const BREAK_GLASS_ACTOR = "krenios";
const FULL_LOWERCASE_SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const INCIDENT_ID = /^[A-Z0-9][A-Z0-9._-]{7,63}$/;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const PRINTABLE_SINGLE_LINE_REASON = /^[\x20-\x7E]{20,500}$/;
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

function fail(message) {
  throw new Error(`Release authorization validation failed: ${message}`);
}

function isPlainObject(value) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function requireAction(value) {
  if (!RELEASE_AUTHORIZATION_ACTIONS.includes(value)) {
    fail("action is unsupported.");
  }
  return value;
}

function requireLowercaseSha(value, label) {
  if (typeof value !== "string" || !FULL_LOWERCASE_SHA.test(value)) {
    fail(`${label} must be a lowercase full 40-character Git SHA.`);
  }
  return value;
}

function normalizeActor(value, label) {
  const actor = String(value ?? "").trim().toLowerCase();
  if (!actor) fail(`${label} is required.`);
  return actor;
}

function normalizeIncidentId(value, label) {
  const incidentId = String(value ?? "").trim().toUpperCase();
  if (!INCIDENT_ID.test(incidentId)) {
    fail(`${label} has an invalid format.`);
  }
  return incidentId;
}

function normalizeReason(value) {
  const reason = String(value ?? "").trim();
  if (!PRINTABLE_SINGLE_LINE_REASON.test(reason)) {
    fail("reason must contain 20-500 printable single-line characters.");
  }
  return reason;
}

function requireRunId(value, label) {
  if (typeof value !== "string" || !POSITIVE_INTEGER.test(value)) {
    fail(`${label} must be a positive integer string.`);
  }
  return value;
}

function requireOriginalAttempt(value) {
  if (value !== "1") fail("workflow run attempt must be exactly 1.");
  return value;
}

function parseNow(value) {
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  if (Number.isNaN(date.getTime())) fail("validation time is invalid.");
  return date.getTime();
}

function normalizeExpiry(value, options = {}) {
  if (typeof value !== "string" || !RFC3339_UTC.test(value)) {
    fail("authorization expiry must be an RFC 3339 UTC timestamp.");
  }
  const components = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/.exec(value);
  const expiresAt = new Date(value);
  if (
    !components ||
    Number.isNaN(expiresAt.getTime()) ||
    expiresAt.getUTCFullYear() !== Number(components[1]) ||
    expiresAt.getUTCMonth() + 1 !== Number(components[2]) ||
    expiresAt.getUTCDate() !== Number(components[3]) ||
    expiresAt.getUTCHours() !== Number(components[4]) ||
    expiresAt.getUTCMinutes() !== Number(components[5]) ||
    expiresAt.getUTCSeconds() !== Number(components[6]) ||
    expiresAt.getUTCMilliseconds() !== Number((components[7] ?? "").padEnd(3, "0"))
  ) {
    fail("authorization expiry is invalid.");
  }
  if (options.allowHistoricalExpiry === true) return expiresAt.toISOString();
  const now = parseNow(options.now);
  if (expiresAt.getTime() <= now) fail("authorization expiry must be in the future.");
  if (expiresAt.getTime() > now + FOUR_HOURS_MS) {
    fail("authorization expiry cannot be more than four hours away.");
  }
  return expiresAt.toISOString();
}

function parseMode(value) {
  if (value === "true") return "break_glass";
  if (value === "false") return "standard";
  fail("single_admin_break_glass must be the literal string true or false.");
}

function deployers(value) {
  if (typeof value !== "string") fail("production release deployers are required.");
  const values = value.split(",")
    .map((actor) => actor.trim().toLowerCase())
    .filter(Boolean);
  if (values.length === 0) fail("production release deployers are required.");
  return values;
}

function assertReleaseContext(input) {
  const releaseSha = requireLowercaseSha(input.releaseSha, "release SHA");
  for (const [value, label] of [
    [input.currentMainSha, "current main SHA"],
    [input.checkoutSha, "checkout SHA"],
    [input.workflowSha, "workflow SHA"],
  ]) {
    if (requireLowercaseSha(value, label) !== releaseSha) {
      fail(`${label} does not match release SHA.`);
    }
  }
  return releaseSha;
}

function assertStandardInput(input, releaseSha) {
  if (input.incidentId !== "" || input.reason !== "") {
    fail("standard mode requires empty incident and reason inputs.");
  }
  if (typeof input.standardConfirmation !== "string" || input.standardConfirmation === "") {
    fail("standard confirmation is required.");
  }
  if (input.confirmation !== input.standardConfirmation) {
    fail("standard confirmation does not match.");
  }
  return Object.freeze({
    mode: "standard",
    action: requireAction(input.action),
    actor: normalizeActor(input.actor, "actor"),
    release_sha: releaseSha,
    workflow_run_id: requireRunId(input.runId, "workflow run ID"),
    workflow_run_attempt: requireOriginalAttempt(input.runAttempt),
  });
}

function assertBreakGlassInput(input, releaseSha, options) {
  if (input.repository !== REPOSITORY || input.ref !== MAIN_REF) {
    fail("repository and ref are not authorized for break-glass.");
  }
  if (input.eventName !== "workflow_dispatch") {
    fail("break-glass requires workflow_dispatch.");
  }
  const actor = normalizeActor(input.actor, "actor");
  const triggeringActor = normalizeActor(input.triggeringActor, "triggering actor");
  const configuredActor = normalizeActor(input.breakGlassActor, "configured break-glass actor");
  if (
    actor !== BREAK_GLASS_ACTOR ||
    actor !== triggeringActor ||
    actor !== configuredActor
  ) {
    fail("break-glass actor does not match the trusted actor tuple.");
  }
  if (!deployers(input.productionReleaseDeployers).includes(actor)) {
    fail("break-glass actor is not a production release deployer.");
  }
  if (requireLowercaseSha(input.breakGlassReleaseSha, "configured break-glass release SHA") !== releaseSha) {
    fail("configured break-glass release SHA does not match release SHA.");
  }
  const normalizedIncidentId = normalizeIncidentId(input.incidentId, "incident ID");
  if (
    normalizeIncidentId(input.breakGlassIncidentId, "configured break-glass incident ID") !==
    normalizedIncidentId
  ) {
    fail("configured break-glass incident ID does not match incident ID.");
  }
  const action = requireAction(input.action);
  if (input.confirmation !== breakGlassConfirmation(action, releaseSha, normalizedIncidentId)) {
    fail("break-glass confirmation does not match.");
  }
  const expiresAt = normalizeExpiry(input.breakGlassExpiresAt, options);
  return Object.freeze({
    mode: "break_glass",
    action,
    actor,
    release_sha: releaseSha,
    incident_id: normalizedIncidentId,
    reason_sha256: releaseAuthorizationReasonSha256(input.reason),
    authorized_expires_at: expiresAt,
    workflow_run_id: requireRunId(input.runId, "workflow run ID"),
    workflow_run_attempt: requireOriginalAttempt(input.runAttempt),
  });
}

export function breakGlassConfirmation(action, releaseSha, incidentId) {
  const prefix = ACTION_CONFIRMATION_PREFIXES[requireAction(action)];
  return `${prefix} ${requireLowercaseSha(releaseSha, "release SHA")} ${normalizeIncidentId(incidentId, "incident ID")}`;
}

export function releaseAuthorizationReasonSha256(reason) {
  return createHash("sha256")
    .update(normalizeReason(reason), "utf8")
    .digest("hex");
}

export function selectReleaseAuthorization(input, options = {}) {
  if (!isPlainObject(input)) fail("input must be an object.");
  const releaseSha = assertReleaseContext(input);
  const mode = parseMode(input.singleAdminBreakGlass);
  return mode === "standard"
    ? assertStandardInput(input, releaseSha)
    : assertBreakGlassInput(input, releaseSha, options);
}

function exactRecord(record, mode) {
  const keys = Object.keys(record).sort();
  const expectedKeys = (mode === "standard"
    ? [
      "mode",
      "action",
      "actor",
      "release_sha",
      "workflow_run_id",
      "workflow_run_attempt",
    ]
    : [
      "mode",
      "action",
      "actor",
      "release_sha",
      "incident_id",
      "reason_sha256",
      "authorized_expires_at",
      "workflow_run_id",
      "workflow_run_attempt",
    ]).sort();
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
    fail("authorization record has unsupported or missing fields.");
  }
}

function expectedValues(expected) {
  if (expected === undefined || expected === null) return {};
  if (!isPlainObject(expected)) fail("expected authorization must be an object.");
  const aliases = {
    release_sha: "releaseSha",
    workflow_run_id: "runId",
    workflow_run_attempt: "runAttempt",
    incident_id: "incidentId",
    reason_sha256: "reasonSha256",
    authorized_expires_at: "authorizedExpiresAt",
  };
  const values = {};
  for (const key of [
    "mode",
    "action",
    "actor",
    "release_sha",
    "workflow_run_id",
    "workflow_run_attempt",
    "incident_id",
    "reason_sha256",
    "authorized_expires_at",
  ]) {
    const alias = aliases[key];
    const hasKey = Object.hasOwn(expected, key);
    const hasAlias = alias && Object.hasOwn(expected, alias);
    if (hasKey && hasAlias && expected[key] !== expected[alias]) {
      fail(`expected ${key} is ambiguous.`);
    }
    if (hasKey || hasAlias) values[key] = hasKey ? expected[key] : expected[alias];
  }
  return values;
}

export function validateReleaseAuthorization(record, expected, options = {}) {
  if (!isPlainObject(record)) fail("authorization record must be an object.");
  if (record.mode !== "standard" && record.mode !== "break_glass") {
    fail("authorization mode is unsupported.");
  }
  exactRecord(record, record.mode);
  const normalized = {
    mode: record.mode,
    action: requireAction(record.action),
    actor: normalizeActor(record.actor, "authorization actor"),
    release_sha: requireLowercaseSha(record.release_sha, "authorization release SHA"),
    workflow_run_id: requireRunId(record.workflow_run_id, "authorization workflow run ID"),
    workflow_run_attempt: requireOriginalAttempt(record.workflow_run_attempt),
  };
  if (record.mode === "break_glass") {
    if (normalized.actor !== BREAK_GLASS_ACTOR) {
      fail("break-glass authorization actor is invalid.");
    }
    if (typeof record.reason_sha256 !== "string" || !SHA256.test(record.reason_sha256)) {
      fail("break-glass reason hash is invalid.");
    }
    Object.assign(normalized, {
      incident_id: normalizeIncidentId(record.incident_id, "authorization incident ID"),
      reason_sha256: record.reason_sha256,
      authorized_expires_at: normalizeExpiry(record.authorized_expires_at, options),
    });
  }
  const expectedRecord = expectedValues(expected);
  for (const [key, value] of Object.entries(expectedRecord)) {
    if (normalized[key] !== value) fail(`authorization ${key} does not match expected evidence.`);
  }
  return Object.freeze(normalized);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
  }
  return value;
}

function canonicalSha256(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalJson(value)), "utf8")
    .digest("hex");
}

export function releaseAuthorizationGrant(record, options = {}) {
  const authorization = validateReleaseAuthorization(record, undefined, {
    ...options,
    allowHistoricalExpiry: true,
  });
  if (authorization.mode === "standard") return Object.freeze({ mode: "standard" });
  return Object.freeze({
    mode: "break_glass",
    actor: authorization.actor,
    release_sha: authorization.release_sha,
    incident_id: authorization.incident_id,
    reason_sha256: authorization.reason_sha256,
    authorized_expires_at: authorization.authorized_expires_at,
  });
}

export function validateReleaseAuthorizationGrant(records, options = {}) {
  if (!Array.isArray(records) || records.length === 0) {
    fail("at least one authorization record is required.");
  }
  const grant = releaseAuthorizationGrant(records[0], options);
  const expected = JSON.stringify(canonicalJson(grant));
  for (const record of records.slice(1)) {
    if (JSON.stringify(canonicalJson(releaseAuthorizationGrant(record, options))) !== expected) {
      fail("authorization grants do not match.");
    }
  }
  return grant;
}

export function releaseAuthorizationSha256(record, options = {}) {
  return canonicalSha256(validateReleaseAuthorization(record, undefined, {
    ...options,
    allowHistoricalExpiry: true,
  }));
}

export function releaseAuthorizationGrantSha256(record, options = {}) {
  return canonicalSha256(releaseAuthorizationGrant(record, options));
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredEnvironment(environment, name) {
  if (!Object.hasOwn(environment, name)) {
    fail(`environment variable ${name} is required.`);
  }
  return environment[name];
}

function workflowInputFromEnvironment(environment) {
  const required = [
    "RELEASE_AUTHORIZATION_ACTION",
    "RELEASE_STANDARD_CONFIRMATION",
    "RELEASE_SINGLE_ADMIN_BREAK_GLASS",
    "RELEASE_INCIDENT_ID",
    "RELEASE_REASON",
    "RELEASE_CONFIRM",
    "RELEASE_SHA",
    "RELEASE_CURRENT_MAIN_SHA",
    "RELEASE_CHECKOUT_SHA",
    "GITHUB_REPOSITORY",
    "GITHUB_REF",
    "GITHUB_EVENT_NAME",
    "GITHUB_ACTOR",
    "GITHUB_TRIGGERING_ACTOR",
    "GITHUB_RUN_ID",
    "GITHUB_RUN_ATTEMPT",
    "GITHUB_WORKFLOW_SHA",
    "PRODUCTION_RELEASE_DEPLOYERS",
    "PRODUCTION_BREAK_GLASS_ACTOR",
    "PRODUCTION_BREAK_GLASS_RELEASE_SHA",
    "PRODUCTION_BREAK_GLASS_INCIDENT_ID",
    "PRODUCTION_BREAK_GLASS_EXPIRES_AT",
  ];
  for (const name of required) requiredEnvironment(environment, name);
  return {
    action: environment.RELEASE_AUTHORIZATION_ACTION,
    standardConfirmation: environment.RELEASE_STANDARD_CONFIRMATION,
    singleAdminBreakGlass: environment.RELEASE_SINGLE_ADMIN_BREAK_GLASS,
    incidentId: environment.RELEASE_INCIDENT_ID,
    reason: environment.RELEASE_REASON,
    confirmation: environment.RELEASE_CONFIRM,
    releaseSha: environment.RELEASE_SHA,
    currentMainSha: environment.RELEASE_CURRENT_MAIN_SHA,
    checkoutSha: environment.RELEASE_CHECKOUT_SHA,
    repository: environment.GITHUB_REPOSITORY,
    ref: environment.GITHUB_REF,
    eventName: environment.GITHUB_EVENT_NAME,
    actor: environment.GITHUB_ACTOR,
    triggeringActor: environment.GITHUB_TRIGGERING_ACTOR,
    runId: environment.GITHUB_RUN_ID,
    runAttempt: environment.GITHUB_RUN_ATTEMPT,
    workflowSha: environment.GITHUB_WORKFLOW_SHA,
    productionReleaseDeployers: environment.PRODUCTION_RELEASE_DEPLOYERS,
    breakGlassActor: environment.PRODUCTION_BREAK_GLASS_ACTOR,
    breakGlassReleaseSha: environment.PRODUCTION_BREAK_GLASS_RELEASE_SHA,
    breakGlassIncidentId: environment.PRODUCTION_BREAK_GLASS_INCIDENT_ID,
    breakGlassExpiresAt: environment.PRODUCTION_BREAK_GLASS_EXPIRES_AT,
  };
}

function writeGithubOutput(path, authorization) {
  appendFileSync(path, [
    `mode=${authorization.mode}`,
    `action=${authorization.action}`,
    `reason_sha256=${authorization.reason_sha256 ?? ""}`,
    `authorized_expires_at=${authorization.authorized_expires_at ?? ""}`,
    "",
  ].join("\n"), "utf8");
}

async function main() {
  if (process.argv[2] !== "validate-workflow") {
    fail("usage: production-break-glass-validation.mjs validate-workflow --out <path> [--github-output <path>].");
  }
  const out = argument("--out");
  const githubOutput = argument("--github-output");
  if (!out) fail("--out is required.");
  if (githubOutput === out) fail("--out and --github-output must be different files.");
  const authorization = selectReleaseAuthorization(
    workflowInputFromEnvironment(process.env),
  );
  writeFileSync(out, `${JSON.stringify(authorization, null, 2)}\n`, "utf8");
  if (githubOutput) writeGithubOutput(githubOutput, authorization);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
