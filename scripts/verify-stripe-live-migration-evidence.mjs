import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { MAIPROP_PRODUCTION_STRIPE_ACCOUNT_ID } from "./stripe-live-readiness-contract.mjs";

const FULL_SHA = /^[0-9a-f]{40}$/;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const STRIPE_WORKFLOW_PATH =
  ".github/workflows/verify-stripe-live-readiness.yml";
const EVIDENCE_TYPE = "maiprop-stripe-live-migration-readiness";
const PRODUCTION_SUPABASE_PROJECT_REF = "qvvicunqcrwpioqnvzxf";
const DEFAULT_MAX_EVIDENCE_AGE_MS = 15 * 60 * 1000;
const MAX_FUTURE_CLOCK_SKEW_MS = 60 * 1000;

function fail(message) {
  throw new Error(`Stripe live migration evidence ${message}`);
}

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value;
}

function requiredString(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) fail(`${label} is required.`);
  return normalized;
}

function fullSha(value, label) {
  const normalized = requiredString(value, label).toLowerCase();
  if (!FULL_SHA.test(normalized)) fail(`${label} must be a full Git SHA.`);
  return normalized;
}

function positiveInteger(value, label) {
  const normalized = requiredString(value, label);
  if (!POSITIVE_INTEGER.test(normalized)) {
    fail(`${label} must be a positive integer.`);
  }
  return normalized;
}

function originalAttempt(value, label) {
  const attempt = positiveInteger(value, label);
  if (attempt !== "1") fail(`${label} must be attempt 1.`);
  return attempt;
}

function normalizedProvenance(value) {
  const provenance = record(value, "provenance");
  const repository = requiredString(
    provenance.repository,
    "provenance repository",
  ).toLowerCase();
  if (!REPOSITORY.test(repository)) {
    fail("provenance repository must be owner/name.");
  }
  const releaseSha = fullSha(provenance.release_sha, "provenance release SHA");
  const sourceTree = fullSha(provenance.source_tree, "provenance source tree");
  const workflowPath = requiredString(
    provenance.workflow_path,
    "provenance workflow path",
  );
  if (workflowPath !== STRIPE_WORKFLOW_PATH) {
    fail(`must be produced by ${STRIPE_WORKFLOW_PATH}.`);
  }
  const workflowRef = requiredString(
    provenance.workflow_ref,
    "provenance workflow ref",
  );
  if (
    workflowRef !==
      `${repository}/${STRIPE_WORKFLOW_PATH}@refs/heads/main`
  ) {
    fail("provenance workflow ref must identify the main workflow.");
  }
  const workflowSha = fullSha(
    provenance.workflow_sha,
    "provenance workflow SHA",
  );
  if (workflowSha !== releaseSha) {
    fail("provenance workflow SHA must equal the release SHA.");
  }
  if (provenance.event !== "workflow_dispatch") {
    fail("provenance event must be workflow_dispatch.");
  }
  const runId = positiveInteger(
    provenance.workflow_run_id,
    "provenance workflow run ID",
  );
  const runAttempt = originalAttempt(
    provenance.workflow_run_attempt,
    "provenance workflow run attempt",
  );
  const actor = requiredString(provenance.actor, "provenance actor");
  const triggeringActor = requiredString(
    provenance.triggering_actor,
    "provenance triggering actor",
  );
  if (actor !== triggeringActor) {
    fail("requires actor to equal triggering actor.");
  }
  return {
    repository,
    releaseSha,
    sourceTree,
    workflowPath,
    workflowRef,
    workflowSha,
    runId,
    runAttempt,
    actor,
    triggeringActor,
    evidenceNonce: requiredString(
      provenance.evidence_nonce,
      "provenance evidence nonce",
    ),
  };
}

export function createStripeLiveMigrationEvidence({
  report,
  provenance,
  stripeKey,
  apiVersion,
  supabaseProjectRef,
  checkedAt = new Date().toISOString(),
}) {
  const readiness = record(report, "readiness report");
  const normalized = normalizedProvenance(provenance);
  if (!/^rk_live_[A-Za-z0-9]+$/.test(String(stripeKey ?? ""))) {
    fail("requires STRIPE_RESTRICTED_KEY with an rk_live_ prefix.");
  }
  const account = record(readiness.account, "readiness account");
  const accountId = requiredString(account.id, "readiness account ID");
  if (accountId !== MAIPROP_PRODUCTION_STRIPE_ACCOUNT_ID) {
    fail(`must target Stripe account ${MAIPROP_PRODUCTION_STRIPE_ACCOUNT_ID}.`);
  }
  const timestamp = requiredString(checkedAt, "checked time");
  if (!Number.isFinite(Date.parse(timestamp))) {
    fail("checked time is invalid.");
  }
  if (supabaseProjectRef !== PRODUCTION_SUPABASE_PROJECT_REF) {
    fail(`must target production Supabase ${PRODUCTION_SUPABASE_PROJECT_REF}.`);
  }
  const issues = Array.isArray(readiness.issues) ? readiness.issues : [];
  const warnings = Array.isArray(readiness.warnings) ? readiness.warnings : [];
  const paymentMethodConfiguration = record(
    readiness.payment_method_configuration,
    "payment method configuration",
  );
  const restrictedKeyPermission = record(
    readiness.restricted_key_permission,
    "restricted key permission",
  );
  return {
    schema_version: 2,
    evidence_type: EVIDENCE_TYPE,
    ok: readiness.ok === true && issues.length === 0,
    release_sha: normalized.releaseSha,
    source_tree: normalized.sourceTree,
    checked_at: timestamp,
    supabase_project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    stripe: {
      api_version: requiredString(apiVersion, "Stripe API version"),
      account_id: accountId,
      mode: "live",
      key_prefix: "rk_live_...",
    },
    provenance: {
      repository: normalized.repository,
      release_sha: normalized.releaseSha,
      source_tree: normalized.sourceTree,
      workflow_path: normalized.workflowPath,
      workflow_ref: normalized.workflowRef,
      workflow_sha: normalized.workflowSha,
      event: "workflow_dispatch",
      workflow_run_id: normalized.runId,
      workflow_run_attempt: normalized.runAttempt,
      actor: normalized.actor,
      triggering_actor: normalized.triggeringActor,
      evidence_nonce: normalized.evidenceNonce,
    },
    account,
    checked: record(readiness.checked, "readiness checks"),
    webhook: readiness.webhook ?? null,
    payment_method_configuration: paymentMethodConfiguration,
    restricted_key_permission: restrictedKeyPermission,
    issues,
    warnings,
  };
}

export function verifyStripeLiveMigrationEvidence(evidence, expected) {
  const value = record(evidence, "document");
  if (value.schema_version !== 2 || value.evidence_type !== EVIDENCE_TYPE) {
    fail("schema or evidence type is invalid.");
  }
  if (value.ok !== true) fail("must have ok=true.");
  if (!Array.isArray(value.issues) || value.issues.length !== 0) {
    fail("must contain an empty issues array.");
  }
  const provenance = normalizedProvenance(value.provenance);
  const releaseSha = fullSha(expected?.releaseSha, "expected release SHA");
  const runId = positiveInteger(
    expected?.workflowRunId,
    "expected workflow run ID",
  );
  const runAttempt = originalAttempt(
    expected?.workflowRunAttempt,
    "expected workflow run attempt",
  );
  const evidenceNonce = requiredString(
    expected?.evidenceNonce,
    "expected evidence nonce",
  );
  if (
    fullSha(value.release_sha, "release SHA") !== releaseSha ||
    provenance.releaseSha !== releaseSha
  ) {
    fail("release SHA does not match the expected release.");
  }
  if (
    fullSha(value.source_tree, "source tree") !== provenance.sourceTree
  ) {
    fail("source tree does not match provenance.");
  }
  if (provenance.runId !== runId || provenance.runAttempt !== runAttempt) {
    fail("workflow run tuple does not match the expected attempt-one run.");
  }
  if (provenance.evidenceNonce !== evidenceNonce) {
    fail("nonce does not match the expected release run tuple.");
  }
  if (value.supabase_project_ref !== PRODUCTION_SUPABASE_PROJECT_REF) {
    fail(`must target production Supabase ${PRODUCTION_SUPABASE_PROJECT_REF}.`);
  }
  const stripe = record(value.stripe, "Stripe identity");
  if (
    stripe.mode !== "live" ||
    stripe.key_prefix !== "rk_live_..." ||
    stripe.account_id !== MAIPROP_PRODUCTION_STRIPE_ACCOUNT_ID
  ) {
    fail("does not prove a restricted live Stripe account check.");
  }
  const account = record(value.account, "account");
  if (
    account.id !== MAIPROP_PRODUCTION_STRIPE_ACCOUNT_ID ||
    account.id !== stripe.account_id
  ) {
    fail("account ID does not match the checked Stripe account.");
  }
  record(value.checked, "checks");
  const paymentMethodConfiguration = record(
    value.payment_method_configuration,
    "payment method configuration",
  );
  if (
    paymentMethodConfiguration.ok !== true ||
    paymentMethodConfiguration.is_default !== true ||
    !/^pmc_[A-Za-z0-9]+$/.test(
      String(paymentMethodConfiguration.configuration_id ?? ""),
    ) ||
    !Array.isArray(paymentMethodConfiguration.enabled_payment_methods) ||
    !paymentMethodConfiguration.enabled_payment_methods.includes("card")
  ) {
    fail("does not prove an active card-capable payment method configuration.");
  }
  const restrictedKeyPermission = record(
    value.restricted_key_permission,
    "restricted key permission",
  );
  if (
    restrictedKeyPermission.denied !== true ||
    restrictedKeyPermission.status !== 403
  ) {
    fail("does not prove that the readiness key lacks write permission.");
  }
  const checkedAtMs = Date.parse(requiredString(value.checked_at, "checked time"));
  const nowValue = expected?.now ?? new Date();
  const nowMs = nowValue instanceof Date ? nowValue.getTime() : Number(nowValue);
  const maxAgeMs = Number(
    expected?.maxAgeMs ?? DEFAULT_MAX_EVIDENCE_AGE_MS,
  );
  if (!Number.isFinite(checkedAtMs)) {
    fail("checked time is invalid.");
  }
  if (!Number.isFinite(nowMs) || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
    fail("freshness policy is invalid.");
  }
  if (checkedAtMs > nowMs + MAX_FUTURE_CLOCK_SKEW_MS) {
    fail("checked time is too far in the future.");
  }
  if (nowMs - checkedAtMs > maxAgeMs) {
    fail("is stale.");
  }
  return {
    ok: true,
    release_sha: releaseSha,
    source_tree: provenance.sourceTree,
    repository: provenance.repository,
    workflow_run_id: runId,
    workflow_run_attempt: runAttempt,
    actor: provenance.actor,
    triggering_actor: provenance.triggeringActor,
    stripe_account_id: stripe.account_id,
    stripe_key_prefix: stripe.key_prefix,
    supabase_project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    payment_method_configuration_id:
      paymentMethodConfiguration.configuration_id,
    restricted_key_write_denied: true,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      fail("arguments must be --name value pairs.");
    }
    const name = key.slice(2);
    if (Object.hasOwn(args, name)) fail(`argument --${name} is duplicated.`);
    args[name] = value;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const evidence = JSON.parse(
    readFileSync(resolve(args.evidence ?? ""), "utf8"),
  );
  const result = verifyStripeLiveMigrationEvidence(evidence, {
    releaseSha: args["release-sha"],
    workflowRunId: args["workflow-run-id"],
    workflowRunAttempt: args["workflow-run-attempt"],
    evidenceNonce: args["evidence-nonce"],
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
