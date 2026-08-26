import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import yaml from "js-yaml";

import {
  releaseAuthorizationSha256,
  validateReleaseAuthorization,
} from "./production-break-glass-validation.mjs";

const result = (failures, summary = {}) => ({
  ok: failures.length === 0,
  failures,
  summary,
});

const LOWERCASE_SHA256 = /^[0-9a-f]{64}$/;
const LOWERCASE_SHA = /^[0-9a-f]{40}$/;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const INCIDENT_ID = /^[A-Z0-9][A-Z0-9._-]{7,63}$/;

const isPlainObject = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

const exactKeys = (value, expected) => {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index]);
};

const productionAttestationTypes = Object.freeze({
  database: "maiprop-production-database-promotion",
  edge: "maiprop-production-edge-promotion",
  cloudflare: "maiprop-cloudflare-production-promotion",
  aggregate: "maiprop-coordinated-production-release",
});

const productionSecurityEvidenceKeys = Object.freeze({
  database: new Set([
    "authorization_mode",
    "authorization_sha256",
    "consumption_sha256",
  ]),
  edge: new Set([
    "authorization_mode",
    "authorization_sha256",
    "consumption_sha256",
  ]),
  cloudflare: new Set([
    "authorization_mode",
    "authorization_sha256",
    "consumption_sha256",
    "authorized_expires_at",
    "mutation_authorization",
    "rollback_authorization",
  ]),
  aggregate: new Set([
    "authorization_mode",
    "authorization_sha256",
    "consumption_sha256",
  ]),
});

function isSecurityEvidenceKey(key) {
  const canonical = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  if ([
    "authorization",
    "authorized",
    "consumption",
    "consumed",
    "incident",
    "reason",
  ].some((term) => canonical.includes(term))) {
    return true;
  }
  return /auth(?:sha|hash|digest|mode|grant|evidence|expir|id|binding|artifact|run|actor|payload|receipt|tuple)/
    .test(canonical) || canonical.endsWith("auth");
}

function rejectUnknownSecurityEvidenceKeys(failures, name, attestation) {
  const allowed = productionSecurityEvidenceKeys[name] ?? new Set();
  for (const key of Object.keys(attestation)) {
    if (allowed.has(key)) continue;
    if (isSecurityEvidenceKey(key)) {
      failures.push(`${name} production attestation contains unsupported security evidence`);
    }
  }
}

function validateConsumptionTuple(failures, value, authorization) {
  const keys = [
    "artifact_id",
    "artifact_digest",
    "binding_artifact_id",
    "payload_sha256",
    "action",
    "incident_id",
    "release_sha",
    "parent_run_id",
  ];
  if (!exactKeys(value, keys)) {
    failures.push("Break-glass consumption evidence has unsupported or missing fields");
    return null;
  }
  for (const field of ["artifact_id", "binding_artifact_id", "parent_run_id"]) {
    if (typeof value[field] !== "string" || !POSITIVE_INTEGER.test(value[field])) {
      failures.push(`Break-glass consumption ${field} must be an exact positive integer string`);
    }
  }
  for (const field of ["artifact_digest", "payload_sha256"]) {
    if (typeof value[field] !== "string" || !LOWERCASE_SHA256.test(value[field])) {
      failures.push(`Break-glass consumption ${field} must be an exact lowercase SHA-256 value`);
    }
  }
  if (
    value.action !== "production-deploy" ||
    value.incident_id !== authorization.incident_id ||
    value.release_sha !== authorization.release_sha ||
    value.parent_run_id !== authorization.workflow_run_id ||
    !INCIDENT_ID.test(value.incident_id ?? "") ||
    !LOWERCASE_SHA.test(value.release_sha ?? "")
  ) {
    failures.push("Break-glass consumption action, incident, SHA, or parent run is not exact");
  }
  return value;
}

function validateCoordinatedReleaseEvidence(failures, evidence) {
  if (!exactKeys(evidence, ["route", "authorization", "consumption", "attestations"])) {
    failures.push("Coordinated release evidence has unsupported or missing fields");
    return {};
  }
  let authorization;
  try {
    authorization = validateReleaseAuthorization(
      evidence.authorization,
      { action: "production-deploy" },
      { allowHistoricalExpiry: true },
    );
    if (
      !exactKeys(evidence.authorization, Object.keys(authorization)) ||
      Object.entries(authorization).some(
        ([key, value]) => evidence.authorization[key] !== value,
      )
    ) {
      throw new Error("authorization is not exactly normalized");
    }
  } catch (error) {
    failures.push(`Coordinated release authorization is invalid: ${error.message}`);
    return {};
  }

  const expectedAuthorizationSha256 = releaseAuthorizationSha256(authorization);
  let expectedConsumptionSha256 = null;
  if (authorization.mode === "standard") {
    if (!exactKeys(evidence.consumption, ["mode"]) || evidence.consumption.mode !== "standard") {
      failures.push("Standard coordinated release evidence cannot contain break-glass consumption");
    }
  } else {
    const consumption = validateConsumptionTuple(
      failures,
      evidence.consumption,
      authorization,
    );
    expectedConsumptionSha256 = consumption?.payload_sha256 ?? null;
  }

  if (!exactKeys(evidence.attestations, Object.keys(productionAttestationTypes))) {
    failures.push("Coordinated production attestations are partial or contain extra evidence");
    return authorization.mode === "break_glass"
      ? { mode: "break_glass", incident_id: authorization.incident_id }
      : { mode: "standard" };
  }

  for (const [name, evidenceType] of Object.entries(productionAttestationTypes)) {
    const attestation = evidence.attestations[name];
    if (!isPlainObject(attestation)) {
      failures.push(`${name} production attestation must be an object`);
      continue;
    }
    if (attestation.schema_version !== 1 || attestation.evidence_type !== evidenceType) {
      failures.push(`${name} production attestation schema or evidence type is invalid`);
    }
    if (attestation.authorization_mode !== authorization.mode) {
      failures.push(`${name} production authorization mode is mixed or changed`);
    }
    if (
      typeof attestation.authorization_sha256 !== "string" ||
      !LOWERCASE_SHA256.test(attestation.authorization_sha256) ||
      attestation.authorization_sha256 !== expectedAuthorizationSha256
    ) {
      failures.push(`${name} production authorization hash is missing, malformed, or changed`);
    }
    if (
      authorization.mode === "break_glass"
        ? (
          typeof attestation.consumption_sha256 !== "string" ||
          !LOWERCASE_SHA256.test(attestation.consumption_sha256) ||
          attestation.consumption_sha256 !== expectedConsumptionSha256
        )
        : attestation.consumption_sha256 !== null
    ) {
      failures.push(`${name} production consumption hash is missing, malformed, or changed`);
    }
    rejectUnknownSecurityEvidenceKeys(failures, name, attestation);
  }
  return authorization.mode === "break_glass"
    ? { mode: "break_glass", incident_id: authorization.incident_id }
    : { mode: "standard" };
}

function validateDirectRecoveryEvidence(failures, evidence) {
  if (!exactKeys(evidence, ["route", "attestation"]) || !isPlainObject(evidence.attestation)) {
    failures.push("Direct recovery evidence has unsupported or missing fields");
    return {};
  }
  const attestation = evidence.attestation;
  if (
    attestation.schema_version !== 1 ||
    attestation.evidence_type !== "maiprop-cloudflare-production-recovery"
  ) {
    failures.push("Direct recovery evidence schema or evidence type is invalid");
  }
  for (const key of Object.keys(attestation)) {
    if (isSecurityEvidenceKey(key)) {
      failures.push("Direct recovery evidence cannot contain unsupported security evidence");
    }
  }
  return { mode: "standard" };
}

function validateReleaseEvidence(failures, evidence) {
  if (!isPlainObject(evidence)) {
    failures.push("Release evidence must be an object");
    return {};
  }
  if (evidence.route === "coordinated") {
    return validateCoordinatedReleaseEvidence(failures, evidence);
  }
  if (evidence.route === "direct_recovery") {
    return validateDirectRecoveryEvidence(failures, evidence);
  }
  failures.push("Release evidence route is unsupported");
  return {};
}

const readText = (root, relativePath) => {
  const path = join(root, relativePath);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
};

const requireMarkers = (failures, path, text, markers) => {
  if (text === null) {
    failures.push(`${path} is missing`);
    return;
  }
  for (const marker of markers) {
    if (!text.includes(marker)) failures.push(`${path} must include ${marker}`);
  }
};

const requirePatterns = (failures, path, text, patterns) => {
  if (text === null) return;
  for (const [pattern, label] of patterns) {
    if (!pattern.test(text)) failures.push(`${path} must include ${label}`);
  }
};

const STAGE_RELEASE_ENVIRONMENT_CLASSIFICATION = new Map([
  ["validate-source", null],
  ["capture-production-n-minus-one", "staging"],
  ["cloudflare-staging-preflight", "staging"],
  ["supabase-staging", null],
  ["staging-n-minus-one-compatibility", "staging"],
  ["cloudflare-staging", "staging"],
  ["staging-business-proofs", "staging"],
  ["staging-stripe-payment", "staging"],
  ["staging-live-security", "staging"],
  ["staging-catalogue-performance", "staging"],
  ["release-candidate-attested", "staging"],
]);

const REUSABLE_SUPABASE_ENVIRONMENT_CLASSIFICATION = new Map([
  ["deploy-supabase-staging", "staging"],
]);

const requireEnvironmentClassification = (
  failures,
  path,
  text,
  classification,
) => {
  if (text === null) return;
  let workflow;
  try {
    workflow = yaml.load(text);
  } catch (error) {
    failures.push(`${path} must contain valid YAML: ${error.message}`);
    return;
  }

  const jobs = workflow?.jobs;
  if (!jobs || typeof jobs !== "object") {
    failures.push(`${path} must define jobs`);
    return;
  }

  for (const [jobId, job] of Object.entries(jobs)) {
    if (!classification.has(jobId)) {
      failures.push(
        `${path} ${jobId} is not explicitly classified as environment-scoped or unscoped`,
      );
      continue;
    }

    const environment = job?.environment;
    const environmentName = typeof environment === "string"
      ? environment
      : environment?.name;
    const requiredEnvironment = classification.get(jobId);
    if (requiredEnvironment === null && environment !== undefined) {
      failures.push(`${path} ${jobId} must not declare a GitHub environment`);
    } else if (
      requiredEnvironment !== null &&
      environmentName !== requiredEnvironment
    ) {
      failures.push(
        `${path} ${jobId} must use the ${requiredEnvironment} environment`,
      );
    }
  }

  for (const jobId of classification.keys()) {
    if (!Object.hasOwn(jobs, jobId)) {
      failures.push(`${path} classified job ${jobId} is missing`);
    }
  }
};

const rejectUnsupportedControls = (
  failures,
  path,
  text,
  { allowEnvironment = false } = {},
) => {
  if (text === null) return;
  for (const [pattern, label] of [
    [/actions\/attest-build-provenance@/i, "GitHub build attestations"],
    [/\bgh\s+attestation\b/i, "gh attestation verification"],
    ...(allowEnvironment
      ? []
      : [[/^\s{4}environment\s*:/m, "GitHub Environment job gates"]]),
    [/^\s+(?:attestations|artifact-metadata|id-token):\s*(?:read|write)\b/mi, "attestation/OIDC permissions"],
  ]) {
    if (pattern.test(text)) failures.push(`${path} must not depend on ${label}`);
  }
};

export function checkSlsaReadiness(root = process.cwd(), options = {}) {
  const failures = [];
  const paths = {
    ci: ".github/workflows/ci.yml",
    stage: ".github/workflows/stage-release.yml",
    approval: ".github/workflows/approve-production-release.yml",
    supabase: ".github/workflows/reusable-supabase-staging.yml",
    production: ".github/workflows/deploy-production-release.yml",
    productionDatabase: ".github/workflows/deploy-supabase-production-db.yml",
    productionEdge: ".github/workflows/deploy-edge-functions.yml",
    directCloudflare: ".github/workflows/direct-cloudflare-production-deploy.yml",
    reusableCloudflare: ".github/workflows/reusable-cloudflare-production-deploy.yml",
    binding: "scripts/release-artifact-binding.mjs",
    create: "scripts/create-release-artifact-binding.mjs",
    verify: "scripts/verify-release-artifact-binding.mjs",
    productionSource: "scripts/production-source-release.mjs",
  };
  const texts = Object.fromEntries(
    Object.entries(paths).map(([name, path]) => [name, readText(root, path)]),
  );

  requireMarkers(failures, paths.binding, texts.binding, [
    "maiprop.release-artifact-binding.v1",
    'createHmac("sha256"',
    "signatureMetadata",
    "if (actor !== triggeringActor)",
    "originalAttempt(input.runAttempt)",
    "id: positiveInteger(input.artifactId",
    "name: requiredString(input.artifactName",
    "digest: normalizeDigest(input.artifactDigest)",
    "trusted artifact ID, name, and digest must be provided together.",
    'verificationMode = "prior-run"',
    'verificationMode !== "same-run"',
    'run?.status !== "in_progress" || run?.conclusion !== null',
    'run?.status !== "completed" || run?.conclusion !== "success"',
  ]);
  requireMarkers(failures, paths.create, texts.create, [
    "RELEASE_EVIDENCE_SIGNING_KEY",
    'args["payload-root"]',
    'args["release-sha"]',
    'args["source-tree"]',
    'args["workflow-sha"]',
    'args["run-attempt"]',
    'args["triggering-actor"]',
    'args["artifact-id"]',
    'args["artifact-name"]',
    'args["artifact-digest"]',
    'args["key-id"]',
  ]);
  requireMarkers(failures, paths.verify, texts.verify, [
    "RELEASE_EVIDENCE_SIGNING_KEY",
    'booleanFlags = new Set(["same-run"])',
    "trusted-current-run-id",
    "trusted-current-run-attempt",
    "trusted-current-actor",
    "trusted-current-triggering-actor",
    "artifact-metadata",
    "producer-run",
    'args["workflow-sha"]',
    'args["run-attempt"]',
    'args["triggering-actor"]',
    'args["artifact-id"]',
    'args["artifact-name"]',
    'args["artifact-digest"]',
  ]);
  requireMarkers(failures, paths.productionSource, texts.productionSource, [
    "maiprop.production-source-release.v1",
    'createHmac("sha256"',
    "timingSafeEqual",
    "source run attempt",
    "archive run attempt",
    "production-source-${releaseSha}",
    ".github/workflows/deploy-production-release.yml",
  ]);

  requireMarkers(failures, paths.ci, texts.ci, [
    "npm sbom --sbom-format cyclonedx --package-lock-only",
    "RELEASE_EVIDENCE_SIGNING_KEY: ${{ secrets.RELEASE_EVIDENCE_SIGNING_KEY }}",
    "RELEASE_EVIDENCE_SIGNING_KEY_ID: ${{ vars.RELEASE_EVIDENCE_SIGNING_KEY_ID }}",
    "node scripts/create-release-artifact-binding.mjs",
    "node scripts/verify-release-artifact-binding.mjs",
    "production-release-candidate-${{ github.sha }}-${{ github.run_attempt }}",
    "production-release-candidate-binding-${{ github.sha }}-${{ github.run_attempt }}",
    "actions/artifacts/$CANDIDATE_ARTIFACT_ID",
    '--release-sha "$GITHUB_SHA"',
    '--source-tree "$source_tree"',
    "--workflow-path .github/workflows/ci.yml",
    '--workflow-sha "$GITHUB_WORKFLOW_SHA"',
    '--run-attempt "$GITHUB_RUN_ATTEMPT"',
    '--actor "$GITHUB_ACTOR"',
    '--triggering-actor "$GITHUB_TRIGGERING_ACTOR"',
    '--artifact-id "$CANDIDATE_ARTIFACT_ID"',
    '--artifact-name "$artifact_name"',
    '--artifact-digest "$CANDIDATE_ARTIFACT_DIGEST"',
    "github.run_attempt == 1",
    "github.actor == github.triggering_actor",
    "--same-run",
    '--trusted-current-run-attempt "$GITHUB_RUN_ATTEMPT"',
    '--trusted-current-actor "$GITHUB_ACTOR"',
    '--trusted-current-triggering-actor "$GITHUB_TRIGGERING_ACTOR"',
  ]);
  requireMarkers(failures, paths.stage, texts.stage, [
    "vars.STAGING_TRUSTED_CONTROL_SHA == github.workflow_sha",
    "github.workflow_sha == github.event.workflow_run.head_sha",
    "github.run_attempt == 1",
    "github.actor == github.triggering_actor",
    "github.event.workflow_run.run_attempt == 1",
    "github.event.workflow_run.actor.login == github.event.workflow_run.triggering_actor.login",
    "production-release-candidate-binding-${{ github.event.workflow_run.head_sha }}-${{ github.event.workflow_run.run_attempt }}",
    "node scripts/verify-release-artifact-binding.mjs",
    "actions/artifacts/$artifact_id",
    '--workflow-sha "$RELEASE_SHA"',
    '--run-attempt "$SOURCE_RUN_ATTEMPT"',
    '--actor "$SOURCE_ACTOR"',
    '--triggering-actor "$SOURCE_TRIGGERING_ACTOR"',
    "release-candidate-attestation-${{ needs.validate-source.outputs.release_sha }}-${{ github.run_attempt }}",
    "release-candidate-attestation-${{ needs.validate-source.outputs.release_sha }}-${{ github.run_attempt }}-binding",
    "RELEASE_EVIDENCE_SIGNING_KEY: ${{ secrets.RELEASE_EVIDENCE_SIGNING_KEY }}",
    "RELEASE_EVIDENCE_SIGNING_KEY_ID: ${{ vars.RELEASE_EVIDENCE_SIGNING_KEY_ID }}",
    '--artifact-id "$FINAL_ARTIFACT_ID"',
    '--artifact-name "$artifact_name"',
    '--artifact-digest "$FINAL_ARTIFACT_DIGEST"',
    '--workflow-sha "$GITHUB_WORKFLOW_SHA"',
    "--same-run",
    '--trusted-current-run-attempt "$GITHUB_RUN_ATTEMPT"',
    '--trusted-current-actor "$GITHUB_ACTOR"',
    '--trusted-current-triggering-actor "$GITHUB_TRIGGERING_ACTOR"',
  ]);
  requireMarkers(failures, paths.approval, texts.approval, [
    "PRODUCTION_RELEASE_APPROVERS: ${{ vars.PRODUCTION_RELEASE_APPROVERS }}",
    "github.run_attempt == 1",
    "github.actor == github.triggering_actor",
    'CURRENT_MAIN="$(',
    '[ "$ACTUAL_SHA" != "$RELEASE_SHA" ]',
    '[ "$CURRENT_MAIN" != "$RELEASE_SHA" ]',
    "The allowlisted approver must be independent from CI and staging producers.",
    'binding_name="release-candidate-attestation-${RELEASE_SHA}-${STAGING_RUN_ATTEMPT}-binding"',
    "production-release-approval-${{ inputs.release_sha }}-${{ github.run_id }}-${{ github.run_attempt }}",
    "production-release-approval-binding-${{ inputs.release_sha }}-${{ github.run_id }}-${{ github.run_attempt }}",
    "RELEASE_EVIDENCE_SIGNING_KEY: ${{ secrets.RELEASE_EVIDENCE_SIGNING_KEY }}",
    "RELEASE_EVIDENCE_SIGNING_KEY_ID: ${{ vars.RELEASE_EVIDENCE_SIGNING_KEY_ID }}",
    "node scripts/verify-release-artifact-binding.mjs",
    "actions/artifacts/$staging_artifact_id",
    '--workflow-sha "$RELEASE_SHA"',
    '--run-attempt "$STAGING_RUN_ATTEMPT"',
    '--actor "$staging_actor"',
    '--triggering-actor "$staging_triggering_actor"',
    '--workflow-sha "$GITHUB_WORKFLOW_SHA"',
    '--artifact-id "$APPROVAL_ARTIFACT_ID"',
    '--artifact-name "$artifact_name"',
    '--artifact-digest "$APPROVAL_ARTIFACT_DIGEST"',
    "--same-run",
    '--trusted-current-run-attempt "$GITHUB_RUN_ATTEMPT"',
    '--trusted-current-actor "$GITHUB_ACTOR"',
    '--trusted-current-triggering-actor "$GITHUB_TRIGGERING_ACTOR"',
  ]);
  requireMarkers(failures, paths.supabase, texts.supabase, [
    "RELEASE_EVIDENCE_SIGNING_KEY:",
    "required: true",
    "RELEASE_EVIDENCE_SIGNING_KEY_ID: ${{ vars.RELEASE_EVIDENCE_SIGNING_KEY_ID }}",
    "production-release-candidate-binding-${{ inputs.release_sha }}-${{ inputs.source_run_attempt }}",
    "node scripts/verify-release-artifact-binding.mjs",
    "actions/artifacts/$artifact_id",
    'artifact_id="$(jq -er \'.artifact.id\' source-binding/release-artifact-binding.json)"',
    '--release-sha "$RELEASE_SHA"',
    '--workflow-sha "$RELEASE_SHA"',
    '--run-attempt "$SOURCE_RUN_ATTEMPT"',
    '--actor "$source_actor"',
    '--triggering-actor "$source_triggering_actor"',
    "github.run_attempt == 1",
    "github.actor == github.triggering_actor",
    "inputs.source_run_attempt == '1'",
  ]);
  requireMarkers(failures, paths.production, texts.production, [
    "inputs.confirm == 'DEPLOY_PRODUCTION_RELEASE'",
    "github.run_attempt == 1",
    "github.actor == github.triggering_actor",
    "github.run_attempt != 1 || github.actor != github.triggering_actor",
    "PRODUCTION_RELEASE_DEPLOYERS: ${{ vars.PRODUCTION_RELEASE_DEPLOYERS }}",
    'if [ "$ACTUAL_SHA" != "$RELEASE_SHA" ]; then',
    'if [ "$CURRENT_MAIN" != "$RELEASE_SHA" ]; then',
    "release-candidate-attestation-${RELEASE_SHA}-${STAGING_RUN_ATTEMPT}-binding",
    "production-release-approval-binding-${RELEASE_SHA}-${APPROVAL_RUN_ID}-${APPROVAL_RUN_ATTEMPT}",
    '--deploy-actor "$DEPLOY_ACTOR"',
    '--allowed-approvers "$PRODUCTION_RELEASE_APPROVERS"',
    "production-mutation-lease-${RELEASE_SHA}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}-cloudflare",
    "node scripts/create-release-artifact-binding.mjs",
    "node scripts/verify-release-artifact-binding.mjs",
    '--workflow-sha "$RELEASE_SHA"',
    '--artifact-id "$PAYLOAD_ARTIFACT_ID"',
    '--artifact-digest "$PAYLOAD_ARTIFACT_DIGEST"',
    "--same-run",
    '--trusted-current-run-id "$GITHUB_RUN_ID"',
    '--trusted-current-run-attempt "$GITHUB_RUN_ATTEMPT"',
    '--trusted-current-actor "$GITHUB_ACTOR"',
    '--trusted-current-triggering-actor "$GITHUB_TRIGGERING_ACTOR"',
    "uses: ./.github/workflows/reusable-cloudflare-production-deploy.yml",
    "production_run_id: ${{ github.run_id }}",
    "production_run_attempt: ${{ github.run_attempt }}",
    "deploy_actor: ${{ github.actor }}",
    "mutation_lease_artifact: ${{ needs.renew-cloudflare-mutation-lease.outputs.mutation_lease_artifact }}",
    "production-release-attestation-${{ inputs.release_sha }}-${{ github.run_id }}-${{ github.run_attempt }}",
    "production-release-attestation-${{ inputs.release_sha }}-${{ github.run_id }}-${{ github.run_attempt }}-binding",
    "authorization_sha256: process.env.AUTHORIZATION_SHA256",
    'consumption_sha256: process.env.AUTHORIZATION_MODE === "break_glass"',
  ]);
  for (const name of ["productionDatabase", "productionEdge"]) {
    requireMarkers(failures, paths[name], texts[name], [
      "authorization_sha256: process.env.AUTHORIZATION_SHA256",
      'consumption_sha256: process.env.AUTHORIZATION_MODE === "break_glass"',
      "node scripts/create-release-artifact-binding.mjs",
      "node scripts/verify-release-artifact-binding.mjs",
      "--artifact-id",
      "--artifact-digest",
      "--same-run",
    ]);
  }
  requireMarkers(failures, paths.directCloudflare, texts.directCloudflare, [
    "inputs.confirm == 'RECOVER_CLOUDFLARE_PRODUCTION'",
    "github.run_attempt == 1",
    "github.actor == github.triggering_actor",
    "github.run_attempt != 1 || github.actor != github.triggering_actor",
    "PRODUCTION_RELEASE_DEPLOYERS: ${{ vars.PRODUCTION_RELEASE_DEPLOYERS }}",
    'if [ "$ACTUAL_SHA" != "$RELEASE_SHA" ] || [ "$CURRENT_MAIN" != "$RELEASE_SHA" ]; then',
    "release-candidate-attestation-${RELEASE_SHA}-${STAGING_RUN_ATTEMPT}-binding",
    "production-release-approval-binding-${RELEASE_SHA}-${APPROVAL_RUN_ID}-${APPROVAL_RUN_ATTEMPT}",
    '--deploy-actor "$DEPLOY_ACTOR"',
    '--allowed-approvers "$PRODUCTION_RELEASE_APPROVERS"',
    "production-mutation-lease-${RELEASE_SHA}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}-cloudflare-recovery",
    "node scripts/create-release-artifact-binding.mjs",
    "node scripts/verify-release-artifact-binding.mjs",
    '--workflow-path .github/workflows/direct-cloudflare-production-deploy.yml',
    '--workflow-sha "$RELEASE_SHA"',
    '--artifact-id "$PAYLOAD_ARTIFACT_ID"',
    '--artifact-digest "$PAYLOAD_ARTIFACT_DIGEST"',
    "--same-run",
    '--trusted-current-run-id "$GITHUB_RUN_ID"',
    '--trusted-current-run-attempt "$GITHUB_RUN_ATTEMPT"',
    '--trusted-current-actor "$GITHUB_ACTOR"',
    '--trusted-current-triggering-actor "$GITHUB_TRIGGERING_ACTOR"',
    "uses: ./.github/workflows/reusable-cloudflare-production-deploy.yml",
    "production_run_id: ${{ github.run_id }}",
    "production_run_attempt: ${{ github.run_attempt }}",
    "deploy_actor: ${{ github.actor }}",
    "mutation_lease_artifact: ${{ needs.validate.outputs.mutation_lease_artifact }}",
    "production-recovery-attestation-${{ inputs.release_sha }}-${{ github.run_id }}-${{ github.run_attempt }}",
    "production-recovery-attestation-${{ inputs.release_sha }}-${{ github.run_id }}-${{ github.run_attempt }}-binding",
  ]);
  requireMarkers(failures, paths.reusableCloudflare, texts.reusableCloudflare, [
    "RELEASE_EVIDENCE_SIGNING_KEY:",
    '[ "$GITHUB_RUN_ATTEMPT" != "1" ]',
    '[ "$GITHUB_ACTOR" != "$GITHUB_TRIGGERING_ACTOR" ]',
    '[ "$DEPLOY_ACTOR" != "$GITHUB_ACTOR" ]',
    "ALLOWED_DEPLOYERS",
    '[ "$(git rev-parse HEAD)" != "$RELEASE_SHA" ]',
    '[ "$(git rev-parse \'HEAD^{tree}\')" != "$SOURCE_TREE" ]',
    '[ "$GITHUB_RUN_ID" != "$PRODUCTION_RUN_ID" ]',
    '[ "$GITHUB_RUN_ATTEMPT" != "$PRODUCTION_RUN_ATTEMPT" ]',
    ".github/workflows/deploy-production-release.yml|.github/workflows/direct-cloudflare-production-deploy.yml",
    "production-release-candidate-binding-${RELEASE_SHA}-${SOURCE_RUN_ATTEMPT}",
    "release-candidate-attestation-${RELEASE_SHA}-${STAGING_RUN_ATTEMPT}-binding",
    "production-release-approval-binding-${RELEASE_SHA}-${APPROVAL_RUN_ID}-${APPROVAL_RUN_ATTEMPT}",
    '"${MUTATION_LEASE_ARTIFACT}" "$current_workflow_path" workflow_dispatch',
    '"$PRODUCTION_RUN_ID" "$PRODUCTION_RUN_ATTEMPT" same-run',
    '--deploy-actor "$GITHUB_ACTOR"',
    '--allowed-approvers "$ALLOWED_APPROVERS"',
    'artifact_id="$(jq -er \'.artifact.id\' "$binding")"',
    'artifact_digest="$(jq -er \'.digest\' "$metadata")"',
    '--workflow-sha "$RELEASE_SHA"',
    '--artifact-id "$artifact_id"',
    '--artifact-digest "$artifact_digest"',
    "--same-run",
    '--trusted-current-run-id "$GITHUB_RUN_ID"',
    '--trusted-current-run-attempt "$GITHUB_RUN_ATTEMPT"',
    '--trusted-current-actor "$GITHUB_ACTOR"',
    '--trusted-current-triggering-actor "$GITHUB_TRIGGERING_ACTOR"',
    "npx --no-install wrangler pages deploy dist",
    "--project-name=maiprop-listing-site",
    "--branch=main",
    '--commit-hash="$RELEASE_SHA"',
    "--commit-dirty=false",
    "Wrangler did not emit exactly one structured Pages deployment receipt.",
    "cloudflare-pages-candidate-guard.mjs authorize-rollback",
    "/deployments/$ROLLBACK_ID/rollback",
    "cloudflare-production-evidence-${{ inputs.release_sha }}-${{ inputs.production_run_id }}-${{ inputs.production_run_attempt }}",
    'artifact_name="cloudflare-production-evidence-${RELEASE_SHA}-${PRODUCTION_RUN_ID}-${PRODUCTION_RUN_ATTEMPT}"',
    'binding_artifact_name="${artifact_name}-binding"',
    "node scripts/create-release-artifact-binding.mjs",
    "node scripts/verify-release-artifact-binding.mjs",
    '--artifact-id "$PAYLOAD_ARTIFACT_ID"',
    '--artifact-digest "$PAYLOAD_ARTIFACT_DIGEST"',
    "authorization_sha256: process.env.AUTHORIZATION_SHA256 || null",
    'consumption_sha256: process.env.AUTHORIZATION_MODE === "break_glass"',
  ]);
  requirePatterns(
    failures,
    paths.reusableCloudflare,
    texts.reusableCloudflare,
    [
      "release_sha",
      "source_tree",
      "source_run_id",
      "source_run_attempt",
      "staging_run_id",
      "staging_run_attempt",
      "approval_run_id",
      "approval_run_attempt",
      "production_run_id",
      "production_run_attempt",
      "backend_run_id",
      "backend_run_attempt",
      "backend_approval_run_id",
      "backend_approval_run_attempt",
      "stripe_readiness_run_id",
      "stripe_readiness_run_attempt",
      "stripe_readiness_sha256",
      "stripe_readiness_artifact_id",
      "stripe_readiness_artifact_digest",
      "artifact_sha256",
      "manifest_sha256",
      "approval_nonce",
      "allowed_approvers",
      "allowed_deployers",
      "deploy_actor",
      "release_evidence_signing_key_id",
      "mutation_lease_artifact",
      "production_project_id",
      "staging_project_id",
      "database_attestation_artifact",
      "database_attestation_sha256",
      "database_binding_artifact",
      "edge_attestation_artifact",
      "edge_attestation_sha256",
      "edge_binding_artifact",
    ].map((name) => [
      new RegExp(`^      ${name}:\\r?\\n        required: true\\r?\\n        type: string$`, "m"),
      `required reusable input ${name}`,
    ]),
  );

  for (const name of [
    "ci",
    "stage",
    "approval",
    "supabase",
    "production",
    "directCloudflare",
    "reusableCloudflare",
  ]) {
    rejectUnsupportedControls(failures, paths[name], texts[name], {
      allowEnvironment: name === "stage" || name === "supabase",
    });
  }

  requireEnvironmentClassification(
    failures,
    paths.stage,
    texts.stage,
    STAGE_RELEASE_ENVIRONMENT_CLASSIFICATION,
  );
  requireEnvironmentClassification(
    failures,
    paths.supabase,
    texts.supabase,
    REUSABLE_SUPABASE_ENVIRONMENT_CLASSIFICATION,
  );

  const bindingWorkflowFiles = [
    "approval",
    "ci",
    "stage",
    "supabase",
    "production",
    "directCloudflare",
    "reusableCloudflare",
  ]
    .filter((name) => texts[name]?.includes("node scripts/create-release-artifact-binding.mjs"))
    .map((name) => paths[name])
    .sort();
  let releaseAuthorization;
  if (Object.keys(options).some((key) => key !== "releaseEvidence")) {
    failures.push("SLSA readiness options contain unsupported fields");
  }
  if (Object.hasOwn(options, "releaseEvidence")) {
    releaseAuthorization = validateReleaseEvidence(
      failures,
      options.releaseEvidence,
    );
  }
  return result(failures, {
    bindingWorkflowFiles,
    githubFreePrivateEnvironmentControls: {
      active: false,
      purpose: "deployment attribution and paid-plan scope only",
    },
    ...(releaseAuthorization && Object.keys(releaseAuthorization).length > 0
      ? { releaseAuthorization }
      : {}),
  });
}

const main = () => {
  const check = checkSlsaReadiness(process.cwd());
  if (!check.ok) {
    for (const failure of check.failures) process.stderr.write(`${failure}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    "GitHub Free release artifact binding readiness OK; staging environment labels are not active protection controls on this private plan\n",
  );
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(fileURLToPath(import.meta.url)).href &&
  process.argv[1].endsWith("check-slsa-readiness.mjs")
) {
  main();
}
