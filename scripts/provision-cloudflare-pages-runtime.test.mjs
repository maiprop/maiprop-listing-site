import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import yaml from "js-yaml";

const testRuntime =
  typeof globalThis.describe === "function" && typeof globalThis.it === "function"
    ? globalThis
    : await import(/* @vite-ignore */ ["node", "test"].join(":"));
const { describe, it } = testRuntime;

import {
  consumptionArtifactName,
  consumptionTuple,
  createConsumptionReceipt,
  validateConsumptionReceipt,
} from "./production-break-glass-consumption.mjs";
import { selectReleaseAuthorization } from "./production-break-glass-validation.mjs";
import { createReleaseArtifactBinding } from "./release-artifact-binding.mjs";

const root = resolve(import.meta.dirname, "..");
const workflowPath = resolve(
  root,
  ".github",
  "workflows",
  "provision-cloudflare-pages-runtime.yml",
);
const releaseSha = "0123456789abcdef0123456789abcdef01234567";
const incidentId = "PERF-BOOTSTRAP-20260826-01";
const plaintextReason = "Emergency Pages runtime bootstrap for the exact release.";

function workflow() {
  return yaml.load(readFileSync(workflowPath, "utf8"));
}

function stepIndex(job, name) {
  return job.steps.findIndex((step) => step.name === name);
}

function artifactListingGuardSource(parsed) {
  const step = parsed.jobs.provision.steps.find(
    (candidate) => candidate.name === "Install exact-name receipt listing guard",
  );
  assert.ok(step, "exact-name receipt listing guard step is missing");
  const marker = "cat > \"$RUNNER_TEMP/verify-consumption-artifacts.mjs\" <<'NODE'\n";
  const start = step.run.indexOf(marker);
  const end = step.run.indexOf("\nNODE", start + marker.length);
  assert.ok(start >= 0 && end > start, "receipt listing guard source is not executable");
  return step.run.slice(start + marker.length, end);
}

function runArtifactListingGuard(source, listing, mode, name, expectedId = "", expectedDigest = "") {
  const root = mkdtempSync(join(tmpdir(), "maiprop-receipt-listing-"));
  try {
    const guardPath = join(root, "verify-consumption-artifacts.mjs");
    const listingPath = join(root, "listing.json");
    writeFileSync(guardPath, `${source}\n`, "utf8");
    writeFileSync(listingPath, `${JSON.stringify(listing)}\n`, "utf8");
    return spawnSync(process.execPath, [
      guardPath,
      listingPath,
      name,
      mode,
      expectedId,
      expectedDigest,
    ], { encoding: "utf8" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function bashPath(path) {
  if (process.platform !== "win32") return path;
  const normalized = path.replaceAll("\\", "/");
  return normalized.replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`);
}

function finalMutationValidationSource(parsed) {
  const step = parsed.jobs.provision.steps.find(
    (candidate) => candidate.name === "Provision strict Cloudflare Pages runtime bindings",
  );
  assert.ok(step, "Pages provider mutation step is missing");
  const receiptValidation = step.run.lastIndexOf("test -s production-break-glass-consumption.json");
  const start = step.run.lastIndexOf(
    'if [ "$AUTHORIZATION_MODE" = "break_glass" ]; then',
    receiptValidation,
  );
  const end = step.run.indexOf('authorization_expires_epoch_ms=""', receiptValidation);
  assert.ok(start >= 0 && end > start, "final Pages mutation validation shell is not extractable");
  return step.run.slice(start, end);
}

function fullMutationBoundarySource(parsed) {
  const step = parsed.jobs.provision.steps.find(
    (candidate) => candidate.name === "Provision strict Cloudflare Pages runtime bindings",
  );
  assert.ok(step, "Pages provider mutation step is missing");
  const receiptValidation = step.run.lastIndexOf("test -s production-break-glass-consumption.json");
  const finalValidation = step.run.lastIndexOf(
    'if [ "$AUTHORIZATION_MODE" = "break_glass" ]; then',
    receiptValidation,
  );
  const currentMain = step.run.lastIndexOf('current_main="$(gh api');
  const start = Math.min(finalValidation, currentMain);
  const endMarker = '"$RAW_DIR/runtime-patch-response.json" > /dev/null';
  const end = step.run.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, "full Pages mutation boundary shell is not extractable");
  return step.run.slice(start, end + endMarker.length);
}

function runFinalMutationValidation(source, fixtureRoot, overrides = {}) {
  const repositoryRoot = bashPath(root);
  const fixture = bashPath(fixtureRoot);
  const adapted = source.replaceAll(
    "node scripts/production-break-glass-consumption.mjs",
    'node "$TEST_REPOSITORY_ROOT/scripts/production-break-glass-consumption.mjs"',
  );
  const environment = {
    AUTHORIZATION_MODE: "break_glass",
    PAGES_ACTION: "pages-staging",
    RELEASE_SHA: releaseSha,
    GITHUB_REPOSITORY: "maiprop/maiprop-listing-site",
    GITHUB_WORKFLOW_REF:
      "maiprop/maiprop-listing-site/.github/workflows/provision-cloudflare-pages-runtime.yml@refs/heads/main",
    GITHUB_WORKFLOW_SHA: releaseSha,
    GITHUB_RUN_ID: "42",
    GITHUB_RUN_ATTEMPT: "1",
    RECEIPT_BINDING_ARTIFACT_ID: "102",
    TEST_REPOSITORY_ROOT: repositoryRoot,
    TEST_FIXTURE_ROOT: fixture,
    ...overrides,
  };
  const command = process.platform === "win32" ? "wsl.exe" : "env";
  const prefix = process.platform === "win32" ? ["--exec", "env"] : [];
  return spawnSync(command, [
    ...prefix,
    ...Object.entries(environment).map(([key, value]) => `${key}=${value}`),
    "bash",
    "-c",
    `set -euo pipefail\ncd "$TEST_FIXTURE_ROOT"\n${adapted}`,
  ], { encoding: "utf8" });
}

function runFullMutationBoundary(source, fixtureRoot, overrides = {}) {
  const repositoryRoot = bashPath(root);
  const fixture = bashPath(fixtureRoot);
  const adapted = source
    .replaceAll(
      "node scripts/production-break-glass-consumption.mjs",
      'node "$TEST_REPOSITORY_ROOT/scripts/production-break-glass-consumption.mjs"',
    )
    .replace(
      'mutation_boundary_epoch_real="$EPOCHREALTIME"',
      'mutation_boundary_epoch_real="${TEST_BOUNDARY_EPOCH_REALTIME:-$EPOCHREALTIME}"',
    );
  const environment = {
    AUTHORIZATION_MODE: "break_glass",
    PAGES_ACTION: "pages-staging",
    RELEASE_SHA: releaseSha,
    GITHUB_REPOSITORY: "maiprop/maiprop-listing-site",
    GITHUB_WORKFLOW_REF:
      "maiprop/maiprop-listing-site/.github/workflows/provision-cloudflare-pages-runtime.yml@refs/heads/main",
    GITHUB_WORKFLOW_SHA: releaseSha,
    GITHUB_RUN_ID: "42",
    GITHUB_RUN_ATTEMPT: "1",
    RECEIPT_BINDING_ARTIFACT_ID: "102",
    API_BASE: "https://api.cloudflare.test/client/v4",
    TARGET_EDIT_TOKEN: "test-edit-token",
    TARGET_ACCOUNT_ID: "test-account",
    TARGET_PROJECT: "test-pages-project",
    TARGET_PROJECT_ID: "test-pages-project-id",
    RAW_DIR: `${fixture}/raw`,
    PATCH_BODY: `${fixture}/runtime-patch.json`,
    TEST_CURRENT_MAIN: releaseSha,
    TEST_GH_DELAY_SECONDS: "0",
    TEST_BOUNDARY_AT: "",
    TEST_BOUNDARY_EPOCH_REALTIME: "",
    TEST_EXPIRED_EPOCH_REALTIME: "",
    TEST_EXPIRY_EPOCH_MS: "",
    TEST_ADVANCE_CLOCK_AFTER_EXPIRY_CHECK: "false",
    TEST_CLOCK_PHASE: "live",
    TEST_PATCH_SENTINEL: `${fixture}/patch-called`,
    TEST_REPOSITORY_ROOT: repositoryRoot,
    TEST_FIXTURE_ROOT: fixture,
    ...overrides,
  };
  const command = process.platform === "win32" ? "wsl.exe" : "env";
  const prefix = process.platform === "win32" ? ["--exec", "env"] : [];
  const preamble = `
set -euo pipefail
cd "$TEST_FIXTURE_ROOT"
mkdir -p "$RAW_DIR"
printf '{}\n' > "$PATCH_BODY"
gh() {
  sleep "$TEST_GH_DELAY_SECONDS"
  printf '%s\n' "$TEST_CURRENT_MAIN"
}
jq() {
  command jq "$@"
  status=$?
  if [ "$status" -eq 0 ] &&
     [ "$TEST_ADVANCE_CLOCK_AFTER_EXPIRY_CHECK" = "true" ] &&
     [[ " $* " == *".authorization.authorized_expires_at"* ]]; then
    TEST_CLOCK_PHASE="expired"
    TEST_BOUNDARY_EPOCH_REALTIME="$TEST_EXPIRED_EPOCH_REALTIME"
  fi
  return "$status"
}
date() {
  if [ -z "$TEST_BOUNDARY_AT" ]; then
    command date "$@"
  elif [[ " $* " == *"+%s%3N"* ]]; then
    printf '%s\n' "$TEST_EXPIRY_EPOCH_MS"
  else
    printf '%s\n' "$TEST_BOUNDARY_AT"
  fi
}
curl() {
  case " $* " in
    *" --request PATCH "*) ;;
    *) return 64 ;;
  esac
  printf '%s\n' "$TEST_CLOCK_PHASE" > "$TEST_PATCH_SENTINEL"
  printf '{"success":true,"result":{"id":"%s","name":"%s"}}\n' \
    "$TARGET_PROJECT_ID" "$TARGET_PROJECT"
}
`;
  return spawnSync(command, [
    ...prefix,
    ...Object.entries(environment).map(([key, value]) => `${key}=${value}`),
    "bash",
    "-c",
    `${preamble}\n${adapted}`,
  ], { encoding: "utf8" });
}

describe("Cloudflare Pages runtime provisioning workflow", () => {
  it("is manual, exact-main, attempt-1, and preserves standard approver gates", () => {
    const parsed = workflow();
    const provision = parsed.jobs.provision;
    const identity = provision.steps.find(
      (step) => step.name === "Verify exact current-main control identity",
    );
    const standard = provision.steps.find(
      (step) => step.name === "Enforce standard Pages authorization gates",
    );

    assert.deepEqual(Object.keys(parsed.on), ["workflow_dispatch"]);
    assert.deepEqual(parsed.on.workflow_dispatch.inputs.target, {
      description: "Fixed Pages runtime to provision",
      required: true,
      type: "choice",
      options: ["staging", "production"],
    });
    assert.deepEqual(parsed.on.workflow_dispatch.inputs.release_sha, {
      description: "Full exact current-main control SHA",
      required: true,
      type: "string",
    });
    assert.ok(provision.if.includes("github.ref == 'refs/heads/main'"));
    assert.ok(provision.if.includes("github.run_attempt == 1"));
    assert.ok(provision.if.includes("github.actor == github.triggering_actor"));
    assert.ok(provision.if.includes("inputs.release_sha == github.workflow_sha"));
    assert.equal(provision.if.includes("PROVISION_STAGING_PAGES_RUNTIME"), false);
    assert.equal(provision.if.includes("RELEASE_ENABLED"), false);
    assert.equal(identity.name, "Verify exact current-main control identity");
    assert.equal(standard.if, "${{ steps.authorization.outputs.mode == 'standard' }}");
    assert.equal(standard.env.ALLOWED_ACTORS,
      "${{ vars.PRODUCTION_RELEASE_APPROVERS }}",
    );
    assert.equal(standard.env.DEPLOYER_ACTORS, "${{ vars.PRODUCTION_RELEASE_DEPLOYERS }}");
    assert.equal(standard.env.STAGING_RELEASE_ENABLED, "${{ vars.STAGING_RELEASE_ENABLED }}");
    assert.equal(standard.env.PRODUCTION_RELEASE_ENABLED, "${{ vars.PRODUCTION_RELEASE_ENABLED }}");
    assert.ok(standard.run.includes("PRODUCTION_RELEASE_ENABLED"));
    assert.ok(standard.run.includes("STAGING_RELEASE_ENABLED"));
    assert.ok(identity.run.includes(
      'current_main="$(gh api "repos/${GITHUB_REPOSITORY}/branches/main" --jq \'.commit.sha\')"',
    ));
    assert.ok(!JSON.stringify(identity).includes("CLOUDFLARE_"));
    assert.ok(!JSON.stringify(identity).includes("SUPABASE_ACCESS_TOKEN"));
  });

  it("patches only one immutable Pages project and verifies strict redacted post-state", () => {
    const parsed = workflow();
    const provision = parsed.jobs.provision;
    const isolation = provision.steps.find(
      (step) => step.name === "Verify provider credential isolation",
    );
    const turnProof = provision.steps.find(
      (step) => step.name === "Functionally verify target TURN key pair",
    );
    const control = provision.steps.find(
      (step) => step.name === "Provision strict Cloudflare Pages runtime bindings",
    );
    const upload = provision.steps.find((step) => step.id === "pages_evidence_upload");

    assert.equal(control.env.CLOUDFLARE_PAGES_READ_TOKEN,
      "${{ secrets.CLOUDFLARE_PAGES_READ_TOKEN }}",
    );
    assert.equal(control.env.CLOUDFLARE_STAGING_PAGES_EDIT_TOKEN,
      undefined,
    );
    assert.equal(control.env.CLOUDFLARE_PAGES_EDIT_TOKEN, undefined);
    assert.ok(control.env.TARGET_EDIT_TOKEN.includes(
      "inputs.target == 'staging'",
    ));
    assert.ok(control.env.TARGET_EDIT_TOKEN.includes(
      "secrets.CLOUDFLARE_STAGING_PAGES_EDIT_TOKEN",
    ));
    assert.ok(control.env.TARGET_EDIT_TOKEN.includes(
      "secrets.CLOUDFLARE_PAGES_EDIT_TOKEN",
    ));
    assert.ok(control.env.PAGES_RUNTIME_TURN_KEY_ID.includes(
      "inputs.target == 'staging'",
    ));
    assert.ok(control.env.PAGES_RUNTIME_TURN_API_TOKEN.includes(
      "inputs.target == 'staging'",
    ));
    assert.equal(control.env.CLOUDFLARE_STAGING_TURN_KEY_ID, undefined);
    assert.equal(control.env.CLOUDFLARE_STAGING_TURN_API_TOKEN, undefined);
    assert.equal(control.env.CLOUDFLARE_TURN_KEY_ID, undefined);
    assert.equal(control.env.CLOUDFLARE_TURN_API_TOKEN, undefined);
    assert.equal(provision.needs, undefined);
    assert.ok(isolation.run.includes(
      '[ "$CLOUDFLARE_STAGING_TURN_KEY_ID" = "$CLOUDFLARE_TURN_KEY_ID" ]',
    ));
    assert.ok(isolation.run.includes(
      '[ "$CLOUDFLARE_STAGING_TURN_API_TOKEN" = "$CLOUDFLARE_TURN_API_TOKEN" ]',
    ));
    assert.ok(stepIndex(provision, turnProof.name) > stepIndex(provision, isolation.name));
    assert.ok(stepIndex(provision, turnProof.name) < stepIndex(
      provision,
      "Precheck and create break-glass consumption receipt",
    ));
    assert.ok(turnProof.env.TURN_KEY_ID.includes("inputs.target == 'staging'"));
    assert.ok(turnProof.env.TURN_API_TOKEN.includes("inputs.target == 'staging'"));
    assert.ok(turnProof.run.includes("verifyCloudflareTurnCredentials"));
    assert.ok(turnProof.run.includes("ttlSeconds: 600"));
    assert.ok(turnProof.run.includes("JSON.stringify(proof)"));
    assert.doesNotMatch(turnProof.run, /process\.env\.TURN_API_TOKEN[^,\n]*\)/);
    assert.ok(control.run.includes('PRODUCTION_PROJECT="maiprop-listing-site"'));
    assert.ok(control.run.includes(
      'STAGING_PROJECT="maiprop-listing-site-staging"',
    ));
    assert.ok(control.run.includes(
      "export PRODUCTION_PROJECT STAGING_PROJECT",
    ));
    assert.ok(control.run.includes(
      "node scripts/build-cloudflare-pages-runtime-patch.mjs",
    ));
    assert.ok(control.run.includes(
      "node scripts/validate-cloudflare-pages-staging-posture.mjs",
    ));
    assert.ok(control.run.includes("?reveal=true"));
    assert.ok(control.run.includes('echo "::add-mask::$service_role_key"'));
    assert.equal(control.run.match(/--request PATCH/g)?.length, 1);
    const patchCommand = control.run.slice(
      control.run.indexOf("curl -fsS", control.run.indexOf("current_main=")),
      control.run.indexOf("runtime-patch-response.json") +
        "runtime-patch-response.json".length,
    );
    assert.ok(patchCommand.includes("--request PATCH"));
    assert.ok(!patchCommand.includes("--retry"));
    const currentMainCheck = control.run.lastIndexOf(
      'current_main="$(gh api',
    );
    assert.ok(currentMainCheck >= 0);
    assert.ok(currentMainCheck < control.run.indexOf("--request PATCH"));
    assert.ok(control.run.includes('trap \'rm -rf "$RAW_DIR"\' EXIT'));
    assert.equal(upload.with.path,
      "${{ runner.temp }}/cloudflare-pages-runtime-evidence/",
    );
    assert.ok(!upload.with.path.includes("raw"));
    assert.doesNotMatch(JSON.stringify(upload),
      /SUPABASE_SERVICE_ROLE_KEY|TURN_API_TOKEN|PAGES_EDIT_TOKEN/,
    );
  });

  it("uploads minimized evidence even after a provisioning or post-read failure", () => {
    const parsed = workflow();
    const provision = parsed.jobs.provision;
    const mutationIndex = stepIndex(
      provision,
      "Provision strict Cloudflare Pages runtime bindings",
    );
    const uploadIndex = stepIndex(
      provision,
      "Upload minimized Cloudflare Pages runtime evidence",
    );
    const upload = provision.steps[uploadIndex];
    const binding = provision.steps.find(
      (step) => step.name === "Create and same-run verify Pages runtime evidence binding",
    );

    assert.ok(mutationIndex >= 0);
    assert.ok(uploadIndex > mutationIndex);
    assert.equal(upload.if, "${{ always() }}");
    assert.equal(
      upload.with.path,
      "${{ runner.temp }}/cloudflare-pages-runtime-evidence/",
    );
    assert.equal(upload.with["if-no-files-found"], "error");
    assert.equal(upload.with.overwrite, false);
    assert.equal(upload.with["retention-days"], 30);
    assert.ok(binding.run.includes("--same-run"));
    assert.ok(binding.run.includes(
      '--payload-root "$RUNNER_TEMP/cloudflare-pages-runtime-evidence"',
    ));
  });

  it("maps both targets through central validation after checkout and before credentials", () => {
    const parsed = workflow();
    const inputs = parsed.on.workflow_dispatch.inputs;
    const provision = parsed.jobs.provision;
    assert.deepEqual(inputs.single_admin_break_glass, {
      description: "Use the exact-SHA single-admin break-glass authorization",
      required: true,
      default: false,
      type: "boolean",
    });
    assert.deepEqual(inputs.incident_id, {
      description: "Configured break-glass incident ID; empty in standard mode",
      required: false,
      type: "string",
    });
    assert.deepEqual(inputs.reason, {
      description: "Ephemeral break-glass reason; empty in standard mode",
      required: false,
      type: "string",
    });
    const checkout = stepIndex(provision, "Verify exact checkout identity");
    const authorization = stepIndex(provision, "Select release authorization");
    const credentials = stepIndex(provision, "Verify provider credential isolation");
    assert.ok(checkout >= 0 && authorization > checkout && credentials > authorization);
    const authorizationStep = provision.steps[authorization];
    assert.ok(authorizationStep.run.includes("pages-staging"));
    assert.ok(authorizationStep.run.includes("pages-production"));
    assert.ok(authorizationStep.run.includes(
      "node scripts/production-break-glass-validation.mjs validate-workflow",
    ));
    assert.equal(authorizationStep.env.RELEASE_REASON, "${{ inputs.reason }}");
    for (const step of provision.steps.slice(0, authorization + 1)) {
      assert.doesNotMatch(
        JSON.stringify(step),
        /CLOUDFLARE_.*TOKEN|SUPABASE_ACCESS_TOKEN|RELEASE_EVIDENCE_SIGNING_KEY/,
      );
    }

    for (const target of ["staging", "production"]) {
      const action = `pages-${target}`;
      const confirmation = target === "staging"
        ? `PROVISION_STAGING_PAGES_BREAK_GLASS ${releaseSha} ${incidentId}`
        : `PROVISION_PRODUCTION_PAGES_BREAK_GLASS ${releaseSha} ${incidentId}`;
      const standardConfirmation = target === "staging"
        ? "PROVISION_STAGING_PAGES_RUNTIME"
        : "PROVISION_PRODUCTION_PAGES_RUNTIME";
      const authorizationRecord = selectReleaseAuthorization({
        action,
        standardConfirmation,
        singleAdminBreakGlass: "true",
        incidentId,
        reason: plaintextReason,
        confirmation,
        releaseSha,
        currentMainSha: releaseSha,
        checkoutSha: releaseSha,
        workflowSha: releaseSha,
        repository: "maiprop/maiprop-listing-site",
        ref: "refs/heads/main",
        eventName: "workflow_dispatch",
        actor: "krenios",
        triggeringActor: "krenios",
        runId: "42",
        runAttempt: "1",
        productionReleaseDeployers: "release-bot,krenios",
        breakGlassActor: "krenios",
        breakGlassReleaseSha: releaseSha,
        breakGlassIncidentId: incidentId,
        breakGlassExpiresAt: "2026-08-26T10:00:00.000Z",
      }, { now: "2026-08-26T08:00:00.000Z" });
      const receipt = createConsumptionReceipt({
        authorization: authorizationRecord,
        repository: "maiprop/maiprop-listing-site",
        workflowRef:
          "maiprop/maiprop-listing-site/.github/workflows/provision-cloudflare-pages-runtime.yml@refs/heads/main",
        workflowSha: releaseSha,
        runId: "42",
        runAttempt: "1",
        consumedAt: "2026-08-26T08:30:00.000Z",
        nonce: "9".repeat(64),
      });
      assert.equal(
        consumptionArtifactName({ action, releaseSha, incidentId }),
        `production-break-glass-consumed-${action}-${releaseSha}-${incidentId}`,
      );
      assert.deepEqual(validateConsumptionReceipt(receipt, {
        authorization: authorizationRecord,
        action,
        repository: "maiprop/maiprop-listing-site",
        workflowRef:
          "maiprop/maiprop-listing-site/.github/workflows/provision-cloudflare-pages-runtime.yml@refs/heads/main",
        workflowSha: releaseSha,
        runId: "42",
        runAttempt: "1",
      }, { now: "2026-08-26T08:30:00.000Z" }), receipt);
      assert.equal(JSON.stringify(receipt).includes(plaintextReason), false);
    }
  });

  it("fails closed when standard target release-enabled variables are not true", () => {
    const provision = workflow().jobs.provision;
    const rejection = provision.steps.find(
      (step) => step.name === "Reject disabled standard Pages target",
    );
    assert.ok(rejection, "disabled standard-target rejection step is missing");
    assert.equal(
      rejection.if,
      "${{ steps.authorization.outputs.mode == 'standard' && !((inputs.target == 'staging' && vars.STAGING_RELEASE_ENABLED == 'true') || (inputs.target == 'production' && vars.PRODUCTION_RELEASE_ENABLED == 'true')) }}",
    );
    assert.ok(rejection.run.includes("exit 1"));
    assert.ok(
      stepIndex(provision, "Reject disabled standard Pages target") <
        stepIndex(provision, "Verify provider credential isolation"),
    );
  });

  it("burns expired or duplicate receipts and verifies exact post-upload identity", () => {
    const guard = artifactListingGuardSource(workflow());
    const exactName =
      `production-break-glass-consumed-pages-staging-${releaseSha}-${incidentId}`;
    const digest = "a".repeat(64);
    const artifact = {
      id: 101,
      node_id: "MDg6QXJ0aWZhY3QxMDE=",
      name: exactName,
      size_in_bytes: 512,
      url: "https://api.github.test/repos/maiprop/maiprop-listing-site/actions/artifacts/101",
      archive_download_url:
        "https://api.github.test/repos/maiprop/maiprop-listing-site/actions/artifacts/101/zip",
      expired: false,
      created_at: "2026-08-26T08:00:00Z",
      expires_at: "2026-09-02T08:00:00Z",
      updated_at: "2026-08-26T08:00:00Z",
      digest: `sha256:${digest}`,
      workflow_run: {
        id: 42,
        repository_id: 1,
        head_repository_id: 1,
        head_branch: "main",
        head_sha: releaseSha,
      },
    };
    const listing = (artifacts) => ({ total_count: artifacts.length, artifacts });
    assert.equal(runArtifactListingGuard(guard, listing([]), "precheck", exactName).status, 0);
    assert.notEqual(runArtifactListingGuard(guard, listing([artifact]), "precheck", exactName).status, 0);
    assert.notEqual(runArtifactListingGuard(
      guard,
      listing([artifact, { ...artifact, id: 102 }]),
      "precheck",
      exactName,
    ).status, 0);
    assert.notEqual(runArtifactListingGuard(
      guard,
      listing([{ ...artifact, expired: true }]),
      "precheck",
      exactName,
    ).status, 0);
    assert.equal(runArtifactListingGuard(
      guard,
      listing([{ ...artifact, name: `${exactName}-suffix` }]),
      "precheck",
      exactName,
    ).status, 0);
    assert.equal(runArtifactListingGuard(
      guard,
      listing([artifact]),
      "postcheck",
      exactName,
      "101",
      digest,
    ).status, 0);
    for (const [label, apiDigest] of [
      ["bare upload digest", digest],
      ["wrong algorithm", `sha512:${digest}`],
      ["uppercase prefix", `SHA256:${digest}`],
      ["uppercase payload", `sha256:${digest.toUpperCase()}`],
      ["malformed payload", `sha256:${digest.slice(1)}`],
      ["wrong API digest", `sha256:${"b".repeat(64)}`],
    ]) {
      assert.notEqual(runArtifactListingGuard(
        guard,
        listing([{ ...artifact, digest: apiDigest }]),
        "postcheck",
        exactName,
        "101",
        digest,
      ).status, 0, `${label} was accepted`);
    }
    assert.notEqual(runArtifactListingGuard(
      guard,
      listing([artifact, { ...artifact, id: 102 }]),
      "postcheck",
      exactName,
      "101",
      digest,
    ).status, 0);
    assert.notEqual(runArtifactListingGuard(
      guard,
      listing([{ ...artifact, name: `${exactName}-suffix` }]),
      "postcheck",
      exactName,
      "101",
      digest,
    ).status, 0);
    assert.notEqual(runArtifactListingGuard(
      guard,
      listing([artifact]),
      "postcheck",
      exactName,
      "102",
      digest,
    ).status, 0);
    assert.notEqual(runArtifactListingGuard(
      guard,
      listing([artifact]),
      "postcheck",
      exactName,
      "101",
      "b".repeat(64),
    ).status, 0);
  });

  it("structurally gates mutation on receipt binding/postcheck and signs attempt-qualified evidence", () => {
    const parsed = workflow();
    const provision = parsed.jobs.provision;
    const orderedNames = [
      "Precheck and create break-glass consumption receipt",
      "Upload immutable break-glass consumption receipt",
      "Create and same-run verify consumption receipt binding",
      "Upload immutable consumption receipt binding",
      "Postcheck and finalize break-glass consumption tuple",
      "Provision strict Cloudflare Pages runtime bindings",
    ];
    const indices = orderedNames.map((name) => stepIndex(provision, name));
    assert.ok(indices.every((index) => index >= 0));
    assert.deepEqual(indices, [...indices].sort((left, right) => left - right));
    const receiptUpload = provision.steps[indices[1]];
    assert.equal(receiptUpload.with.overwrite, false);
    assert.equal(receiptUpload.with["retention-days"], 7);
    const receiptBinding = provision.steps[indices[2]];
    assert.ok(receiptBinding.run.includes("scripts/create-release-artifact-binding.mjs"));
    assert.ok(receiptBinding.run.includes("scripts/verify-release-artifact-binding.mjs"));
    assert.ok(receiptBinding.run.includes("--same-run"));
    const finalization = provision.steps[indices[4]];
    assert.ok(finalization.run.includes("production-break-glass-consumption.mjs verify"));
    assert.ok(finalization.run.includes("consumptionTuple"));
    assert.ok(finalization.run.includes("verified=true"));
    const mutation = provision.steps[indices[5]];
    assert.equal(
      mutation.env.CONSUMPTION_VERIFIED,
      "${{ steps.standard_consumption.outputs.verified || steps.break_glass_consumption.outputs.verified }}",
    );
    assert.ok(mutation.run.indexOf('[ "$CONSUMPTION_VERIFIED" != "true" ]') >= 0);
    assert.ok(mutation.run.indexOf('[ "$CONSUMPTION_VERIFIED" != "true" ]') < mutation.run.indexOf("--request PATCH"));
    assert.ok(mutation.run.includes("--slurpfile authorization release-authorization.json"));
    assert.ok(mutation.run.includes("--slurpfile consumption consumption-tuple.json"));

    const evidenceUpload = provision.steps.find((step) => step.id === "pages_evidence_upload");
    assert.equal(
      evidenceUpload.with.name,
      "cloudflare-pages-runtime-${{ inputs.target }}-${{ inputs.release_sha }}-${{ github.run_id }}-${{ github.run_attempt }}",
    );
    assert.equal(evidenceUpload.with.overwrite, false);
    assert.equal(evidenceUpload.with["retention-days"], 30);
    const pagesBinding = provision.steps.find(
      (step) => step.name === "Create and same-run verify Pages runtime evidence binding",
    );
    assert.ok(pagesBinding.run.includes("scripts/create-release-artifact-binding.mjs"));
    assert.ok(pagesBinding.run.includes("scripts/verify-release-artifact-binding.mjs"));
    assert.ok(pagesBinding.run.includes("--same-run"));
    const bindingUpload = provision.steps.find((step) => step.id === "pages_binding_upload");
    assert.equal(
      bindingUpload.with.name,
      "cloudflare-pages-runtime-${{ inputs.target }}-${{ inputs.release_sha }}-${{ github.run_id }}-${{ github.run_attempt }}-binding",
    );
    assert.equal(bindingUpload.with.overwrite, false);
    assert.equal(bindingUpload.with["retention-days"], 30);
    assert.equal(JSON.stringify(provision.steps).includes("$GITHUB_STEP_SUMMARY"), false);
  });

  it("revalidates break-glass expiry and the authenticated receipt at the provider mutation boundary", () => {
    const parsed = workflow();
    const mutation = parsed.jobs.provision.steps.find(
      (step) => step.name === "Provision strict Cloudflare Pages runtime bindings",
    );
    assert.equal(
      mutation.env.AUTHORIZATION_MODE,
      "${{ steps.authorization.outputs.mode }}",
    );
    assert.equal(
      mutation.env.PAGES_ACTION,
      "${{ steps.authorization.outputs.action }}",
    );
    const liveVerification = mutation.run.lastIndexOf(
      "production-break-glass-consumption.mjs verify",
    );
    const bindingVerification = mutation.run.lastIndexOf(
      "receipt-binding/verification.json",
    );
    const currentMain = mutation.run.lastIndexOf('current_main="$(gh api');
    const patch = mutation.run.indexOf("--request PATCH");
    assert.ok(liveVerification >= 0, "provider shell must revalidate break-glass expiry");
    assert.ok(bindingVerification >= 0, "provider shell must require authenticated receipt binding");
    assert.ok(currentMain < bindingVerification);
    assert.ok(bindingVerification < liveVerification && liveVerification < patch);
    assert.doesNotMatch(mutation.run, /RELEASE_REASON/);

    const fixtureRoot = mkdtempSync(join(tmpdir(), "maiprop-pages-expiry-rollover-"));
    try {
      const authorizationPath = join(fixtureRoot, "release-authorization.json");
      const receiptPath = join(fixtureRoot, "production-break-glass-consumption.json");
      const now = Date.now();
      const expiresAt = new Date(now - 1_000).toISOString();
      const selectedAt = new Date(now - 5_000).toISOString();
      const consumedAt = new Date(now - 2_000).toISOString();
      const authorization = selectReleaseAuthorization({
        action: "pages-staging",
        standardConfirmation: "PROVISION_STAGING_PAGES_RUNTIME",
        singleAdminBreakGlass: "true",
        incidentId,
        reason: plaintextReason,
        confirmation: `PROVISION_STAGING_PAGES_BREAK_GLASS ${releaseSha} ${incidentId}`,
        releaseSha,
        currentMainSha: releaseSha,
        checkoutSha: releaseSha,
        workflowSha: releaseSha,
        repository: "maiprop/maiprop-listing-site",
        ref: "refs/heads/main",
        eventName: "workflow_dispatch",
        actor: "krenios",
        triggeringActor: "krenios",
        runId: "42",
        runAttempt: "1",
        productionReleaseDeployers: "krenios",
        breakGlassActor: "krenios",
        breakGlassReleaseSha: releaseSha,
        breakGlassIncidentId: incidentId,
        breakGlassExpiresAt: expiresAt,
      }, { now: selectedAt });
      const receipt = createConsumptionReceipt({
        authorization,
        repository: "maiprop/maiprop-listing-site",
        workflowRef:
          "maiprop/maiprop-listing-site/.github/workflows/provision-cloudflare-pages-runtime.yml@refs/heads/main",
        workflowSha: releaseSha,
        runId: "42",
        runAttempt: "1",
        consumedAt,
        nonce: "9".repeat(64),
      });
      assert.deepEqual(validateConsumptionReceipt(receipt, {
        authorization,
        action: "pages-staging",
        repository: "maiprop/maiprop-listing-site",
        workflowRef:
          "maiprop/maiprop-listing-site/.github/workflows/provision-cloudflare-pages-runtime.yml@refs/heads/main",
        workflowSha: releaseSha,
        runId: "42",
        runAttempt: "1",
      }, { now: consumedAt }), receipt);
      writeFileSync(authorizationPath, `${JSON.stringify(authorization)}\n`);
      writeFileSync(receiptPath, `${JSON.stringify(receipt)}\n`);

      const result = spawnSync(process.execPath, [
        resolve(root, "scripts", "production-break-glass-consumption.mjs"),
        "verify",
        "--file", receiptPath,
        "--authorization", authorizationPath,
        "--action", "pages-staging",
      ], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          GITHUB_REPOSITORY: "maiprop/maiprop-listing-site",
          GITHUB_WORKFLOW_REF:
            "maiprop/maiprop-listing-site/.github/workflows/provision-cloudflare-pages-runtime.yml@refs/heads/main",
          GITHUB_WORKFLOW_SHA: releaseSha,
          GITHUB_RUN_ID: "42",
          GITHUB_RUN_ATTEMPT: "1",
        },
      });
      assert.notEqual(result.status, 0, "rolled-over authorization reached PATCH boundary");
      assert.match(result.stderr, /expir/i);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("binds the final Pages mutation and revalidates expiry after current-main lookup", { timeout: 60_000 }, () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "maiprop-pages-receipt-rebind-"));
    try {
      const repository = "maiprop/maiprop-listing-site";
      const workflowPath = ".github/workflows/provision-cloudflare-pages-runtime.yml";
      const workflowRef = `${repository}/${workflowPath}@refs/heads/main`;
      const sourceTree = "b".repeat(40);
      const artifactDigest = "c".repeat(64);
      const signingKey = "pages-receipt-binding-test-key-".padEnd(64, "x");
      const keyId = "pages-receipt-test-key";
      const receiptPath = join(fixtureRoot, "production-break-glass-consumption.json");
      const authorizationPath = join(fixtureRoot, "release-authorization.json");
      const tuplePath = join(fixtureRoot, "consumption-tuple.json");
      const bindingRoot = join(fixtureRoot, "receipt-binding");
      const bindingPath = join(bindingRoot, "release-artifact-binding.json");
      const verificationPath = join(bindingRoot, "verification.json");
      const metadataRoot = join(fixtureRoot, "metadata");
      const artifactPath = join(metadataRoot, "artifact.json");
      const runPath = join(metadataRoot, "run.json");
      mkdirSync(bindingRoot, { recursive: true });
      mkdirSync(metadataRoot, { recursive: true });

      const now = Date.now();
      const makeAuthorization = ({ expiresAt, selectedAt }) => selectReleaseAuthorization({
        action: "pages-staging",
        standardConfirmation: "PROVISION_STAGING_PAGES_RUNTIME",
        singleAdminBreakGlass: "true",
        incidentId,
        reason: plaintextReason,
        confirmation: `PROVISION_STAGING_PAGES_BREAK_GLASS ${releaseSha} ${incidentId}`,
        releaseSha,
        currentMainSha: releaseSha,
        checkoutSha: releaseSha,
        workflowSha: releaseSha,
        repository,
        ref: "refs/heads/main",
        eventName: "workflow_dispatch",
        actor: "krenios",
        triggeringActor: "krenios",
        runId: "42",
        runAttempt: "1",
        productionReleaseDeployers: "krenios",
        breakGlassActor: "krenios",
        breakGlassReleaseSha: releaseSha,
        breakGlassIncidentId: incidentId,
        breakGlassExpiresAt: expiresAt,
      }, { now: selectedAt });
      const authorization = makeAuthorization({
        expiresAt: new Date(now + 5 * 60 * 1000).toISOString(),
        selectedAt: new Date(now - 5_000).toISOString(),
      });
      const receipt = (consumedAt, nonce, selectedAuthorization = authorization) =>
        createConsumptionReceipt({
          authorization: selectedAuthorization,
          repository,
          workflowRef,
          workflowSha: releaseSha,
          runId: "42",
          runAttempt: "1",
          consumedAt,
          nonce,
        });
      const receiptA = receipt(new Date(now - 3_000).toISOString(), "8".repeat(64));
      const receiptB = receipt(new Date(now - 2_000).toISOString(), "9".repeat(64));
      const writeReceipt = (value) => {
        const bytes = `${JSON.stringify(value, null, 2)}\n`;
        writeFileSync(receiptPath, bytes);
        return createHash("sha256").update(bytes).digest("hex");
      };
      writeFileSync(authorizationPath, `${JSON.stringify(authorization, null, 2)}\n`);
      const receiptSha256 = writeReceipt(receiptA);
      const tuple = consumptionTuple({
        receipt: receiptA,
        payloadArtifact: { artifactId: "101", artifactDigest },
        bindingArtifact: { artifactId: "102" },
        payloadSha256: receiptSha256,
      });
      writeFileSync(tuplePath, `${JSON.stringify(tuple, null, 2)}\n`);

      const artifactName = consumptionArtifactName({
        action: "pages-staging",
        releaseSha,
        incidentId,
      });
      const createBinding = () => createReleaseArtifactBinding({
        payloadRoot: receiptPath,
        repository,
        releaseSha,
        sourceTree,
        workflowPath,
        workflowRef,
        workflowSha: releaseSha,
        event: "workflow_dispatch",
        runId: "42",
        runAttempt: "1",
        actor: "krenios",
        triggeringActor: "krenios",
        artifactId: "101",
        artifactName,
        artifactDigest,
        keyId,
        signingKey,
        issuedAt: new Date(now - 2_500).toISOString(),
        nonce: "7".repeat(64),
      });
      const binding = createBinding();
      writeFileSync(bindingPath, `${JSON.stringify(binding, null, 2)}\n`);
      writeFileSync(artifactPath, `${JSON.stringify({
        id: 101,
        name: artifactName,
        expired: false,
        digest: `sha256:${artifactDigest}`,
        workflow_run: {
          id: 42,
          head_sha: releaseSha,
          repository_id: 1,
          head_repository_id: 1,
        },
      })}\n`);
      writeFileSync(runPath, `${JSON.stringify({
        id: 42,
        run_attempt: 1,
        head_sha: releaseSha,
        head_branch: "main",
        path: workflowPath,
        event: "workflow_dispatch",
        status: "in_progress",
        conclusion: null,
        actor: { login: "krenios" },
        triggering_actor: { login: "krenios" },
        repository: { full_name: repository, id: 1 },
        head_repository: { full_name: repository, id: 1 },
      })}\n`);
      const verifyBinding = () => spawnSync(process.execPath, [
        resolve(root, "scripts", "verify-release-artifact-binding.mjs"),
        "--binding", bindingPath,
        "--payload-root", receiptPath,
        "--artifact-metadata", artifactPath,
        "--producer-run", runPath,
        "--repository", repository,
        "--release-sha", releaseSha,
        "--source-tree", sourceTree,
        "--workflow-path", workflowPath,
        "--workflow-ref", workflowRef,
        "--workflow-sha", releaseSha,
        "--event", "workflow_dispatch",
        "--run-id", "42",
        "--run-attempt", "1",
        "--actor", "krenios",
        "--triggering-actor", "krenios",
        "--artifact-id", "101",
        "--artifact-name", artifactName,
        "--artifact-digest", artifactDigest,
        "--key-id", keyId,
        "--same-run",
        "--trusted-current-run-id", "42",
        "--trusted-current-run-attempt", "1",
        "--trusted-current-actor", "krenios",
        "--trusted-current-triggering-actor", "krenios",
      ], {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, RELEASE_EVIDENCE_SIGNING_KEY: signingKey },
      });
      const verification = verifyBinding();
      assert.equal(verification.status, 0, verification.stderr);
      writeFileSync(verificationPath, verification.stdout);

      const finalValidation = finalMutationValidationSource(workflow());
      const original = runFinalMutationValidation(finalValidation, fixtureRoot);
      assert.equal(original.status, 0, original.stderr);
      const standard = runFinalMutationValidation(finalValidation, fixtureRoot, {
        AUTHORIZATION_MODE: "standard",
      });
      assert.equal(standard.status, 0, standard.stderr);

      writeReceipt(receiptB);
      const substituted = runFinalMutationValidation(finalValidation, fixtureRoot);
      assert.notEqual(
        substituted.status,
        0,
        "valid receipt B with the same authorization and run replaced signed receipt A",
      );
      writeReceipt(receiptA);

      const originalTuple = JSON.parse(readFileSync(tuplePath, "utf8"));
      for (const [label, changed] of [
        ["payload digest", { ...originalTuple, payload_sha256: "d".repeat(64) }],
        ["payload artifact digest", { ...originalTuple, artifact_digest: "d".repeat(64) }],
        ["payload artifact ID", { ...originalTuple, artifact_id: "104" }],
        ["binding artifact ID", { ...originalTuple, binding_artifact_id: "103" }],
        ["incident ID", { ...originalTuple, incident_id: "PERF-REBOUND-20260826-02" }],
        ["extra tuple field", { ...originalTuple, receipt_sha256: receiptSha256 }],
      ]) {
        writeFileSync(tuplePath, `${JSON.stringify(changed, null, 2)}\n`);
        const result = runFinalMutationValidation(finalValidation, fixtureRoot);
        assert.notEqual(result.status, 0, `${label} mismatch reached PATCH`);
      }
      writeFileSync(tuplePath, `${JSON.stringify(originalTuple, null, 2)}\n`);

      const originalVerification = JSON.parse(readFileSync(verificationPath, "utf8"));
      writeFileSync(verificationPath, `${JSON.stringify({
        ...originalVerification,
        files: [
          ...originalVerification.files,
          { path: "extra.json", size: 0, sha256: "e".repeat(64) },
        ],
      }, null, 2)}\n`);
      const extraFile = runFinalMutationValidation(finalValidation, fixtureRoot);
      assert.notEqual(extraFile.status, 0, "binding verification accepted an extra file");
      writeFileSync(verificationPath, `${JSON.stringify(originalVerification, null, 2)}\n`);

      const changedBinding = structuredClone(binding);
      changedBinding.files[0].sha256 = "f".repeat(64);
      writeFileSync(bindingPath, `${JSON.stringify(changedBinding, null, 2)}\n`);
      const bindingMismatch = runFinalMutationValidation(finalValidation, fixtureRoot);
      assert.notEqual(bindingMismatch.status, 0, "signed binding digest mismatch reached PATCH");

      writeReceipt(receiptA);
      writeFileSync(authorizationPath, `${JSON.stringify(authorization, null, 2)}\n`);
      writeFileSync(tuplePath, `${JSON.stringify(originalTuple, null, 2)}\n`);
      writeFileSync(bindingPath, `${JSON.stringify(binding, null, 2)}\n`);
      writeFileSync(verificationPath, `${JSON.stringify(originalVerification, null, 2)}\n`);

      const fullBoundary = fullMutationBoundarySource(workflow());
      const patchSentinel = join(fixtureRoot, "patch-called");
      const runBoundary = (overrides = {}) => {
        rmSync(patchSentinel, { force: true });
        return runFullMutationBoundary(fullBoundary, fixtureRoot, overrides);
      };
      const liveBreakGlass = runBoundary();
      assert.equal(liveBreakGlass.status, 0, liveBreakGlass.stderr);
      assert.equal(existsSync(patchSentinel), true, "live break-glass did not reach PATCH");

      const standardBoundary = runBoundary({ AUTHORIZATION_MODE: "standard" });
      assert.equal(standardBoundary.status, 0, standardBoundary.stderr);
      assert.equal(existsSync(patchSentinel), true, "standard authorization did not reach PATCH");

      const staleMain = runBoundary({ TEST_CURRENT_MAIN: "f".repeat(40) });
      assert.notEqual(staleMain.status, 0, "current-main mismatch reached PATCH");
      assert.equal(existsSync(patchSentinel), false, "current-main mismatch invoked PATCH");

      const expiryEpochMs = Date.parse(authorization.authorized_expires_at);
      const epochRealtime = (epochMs) =>
        `${Math.floor(epochMs / 1_000)}.${String(epochMs % 1_000).padStart(3, "0")}000`;
      const controlledClock = {
        TEST_EXPIRY_EPOCH_MS: String(expiryEpochMs),
        TEST_EXPIRED_EPOCH_REALTIME: epochRealtime(expiryEpochMs + 1),
      };
      const justLive = runBoundary({
        ...controlledClock,
        TEST_BOUNDARY_AT: new Date(expiryEpochMs - 1).toISOString(),
        TEST_BOUNDARY_EPOCH_REALTIME: epochRealtime(expiryEpochMs - 1),
      });
      assert.equal(justLive.status, 0, justLive.stderr);
      assert.equal(readFileSync(patchSentinel, "utf8").trim(), "live");

      const equality = runBoundary({
        ...controlledClock,
        TEST_BOUNDARY_AT: new Date(expiryEpochMs).toISOString(),
        TEST_BOUNDARY_EPOCH_REALTIME: epochRealtime(expiryEpochMs),
      });
      assert.notEqual(equality.status, 0, `expiry equality reached PATCH: ${equality.stderr}`);
      assert.equal(existsSync(patchSentinel), false, "expiry equality invoked PATCH");

      const expired = runBoundary({
        ...controlledClock,
        TEST_BOUNDARY_AT: new Date(expiryEpochMs + 1).toISOString(),
        TEST_BOUNDARY_EPOCH_REALTIME: epochRealtime(expiryEpochMs + 1),
      });
      assert.notEqual(expired.status, 0, "expired boundary reached PATCH");
      assert.equal(existsSync(patchSentinel), false, "expired boundary invoked PATCH");

      const crossedAfterCapture = runBoundary({
        ...controlledClock,
        TEST_BOUNDARY_AT: new Date(expiryEpochMs - 1).toISOString(),
        TEST_BOUNDARY_EPOCH_REALTIME: epochRealtime(expiryEpochMs - 1),
        TEST_ADVANCE_CLOCK_AFTER_EXPIRY_CHECK: "true",
      });
      const crossedPatchPhase = existsSync(patchSentinel)
        ? readFileSync(patchSentinel, "utf8").trim()
        : "not-called";
      assert.equal(
        crossedPatchPhase,
        "not-called",
        `authorization expired during the external expiry check but PATCH ran in ${crossedPatchPhase} phase (status ${crossedAfterCapture.status})`,
      );
      assert.notEqual(
        crossedAfterCapture.status,
        0,
        "authorization expired after boundary capture but still reached PATCH",
      );

      const nearExpiryNow = Date.now();
      const nearExpiryAuthorization = makeAuthorization({
        expiresAt: new Date(nearExpiryNow + 3_000).toISOString(),
        selectedAt: new Date(nearExpiryNow - 1_000).toISOString(),
      });
      const nearExpiryReceipt = receipt(
        new Date(nearExpiryNow).toISOString(),
        "6".repeat(64),
        nearExpiryAuthorization,
      );
      writeFileSync(
        authorizationPath,
        `${JSON.stringify(nearExpiryAuthorization, null, 2)}\n`,
      );
      const nearExpiryReceiptSha256 = writeReceipt(nearExpiryReceipt);
      const nearExpiryTuple = consumptionTuple({
        receipt: nearExpiryReceipt,
        payloadArtifact: { artifactId: "101", artifactDigest },
        bindingArtifact: { artifactId: "102" },
        payloadSha256: nearExpiryReceiptSha256,
      });
      writeFileSync(tuplePath, `${JSON.stringify(nearExpiryTuple, null, 2)}\n`);
      const nearExpiryBinding = createBinding();
      writeFileSync(bindingPath, `${JSON.stringify(nearExpiryBinding, null, 2)}\n`);
      const nearExpiryVerification = verifyBinding();
      assert.equal(nearExpiryVerification.status, 0, nearExpiryVerification.stderr);
      writeFileSync(verificationPath, nearExpiryVerification.stdout);

      const rolledOver = runBoundary({ TEST_GH_DELAY_SECONDS: "5" });
      assert.equal(
        existsSync(patchSentinel),
        false,
        `authorization expired during current-main lookup but PATCH ran (status ${rolledOver.status})`,
      );
      assert.notEqual(rolledOver.status, 0, "expired authorization reached PATCH");
      for (const [label, result] of [
        ["live break-glass", liveBreakGlass],
        ["standard", standardBoundary],
        ["current-main mismatch", staleMain],
        ["just-live boundary", justLive],
        ["expiry equality", equality],
        ["expired boundary", expired],
        ["post-capture expiry", crossedAfterCapture],
        ["expiry rollover", rolledOver],
      ]) {
        assert.doesNotMatch(
          `${result.stdout}\n${result.stderr}`,
          /Emergency Pages|test-key/,
          `${label} logged plaintext authorization evidence`,
        );
      }

      const currentMain = fullBoundary.indexOf('current_main="$(gh api');
      const finalLiveCheck = fullBoundary.lastIndexOf(
        "production-break-glass-consumption.mjs verify",
      );
      const expiryPrecomputation = fullBoundary.indexOf('authorization_expires_epoch_ms=""');
      const mutationBoundary = fullBoundary.indexOf(
        'mutation_boundary_epoch_real="$EPOCHREALTIME"',
      );
      const patch = fullBoundary.indexOf("--request PATCH");
      const patchCommand = fullBoundary.lastIndexOf("curl -fsS", patch);
      assert.ok(currentMain >= 0 && currentMain < finalLiveCheck);
      assert.ok(finalLiveCheck < expiryPrecomputation);
      assert.ok(expiryPrecomputation < mutationBoundary && mutationBoundary < patchCommand);
      const boundaryTail = fullBoundary.slice(mutationBoundary, patchCommand);
      assert.doesNotMatch(boundaryTail, /\b(?:date|jq|node|gh|curl|wget|sleep)\b/);
      assert.equal(
        boundaryTail.trim(),
        `mutation_boundary_epoch_real="$EPOCHREALTIME"
if ! [[ "$mutation_boundary_epoch_real" =~ ^[1-9][0-9]{9,}\\.[0-9]{6}$ ]]; then
  echo "::error::Mutation boundary clock is not canonical."
  exit 1
fi
mutation_boundary_epoch_us="\${mutation_boundary_epoch_real/./}"
if [ "$AUTHORIZATION_MODE" = "break_glass" ] &&
   (( 10#$mutation_boundary_epoch_us >= 10#$authorization_expires_epoch_ms * 1000 )); then
  echo "::error::Break-glass authorization expired before the Pages mutation boundary."
  exit 1
fi`,
      );
      assert.match(
        fullBoundary.slice(patchCommand, patch + "--request PATCH".length),
        /^curl -fsS \\\n  --request PATCH$/,
      );
      assert.doesNotMatch(fullBoundary, /RELEASE_REASON|Emergency Pages/);

      assert.match(finalValidation, /payload_sha256 == \$receipt_sha256/);
      assert.match(finalValidation, /release-artifact-binding\.json/);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
