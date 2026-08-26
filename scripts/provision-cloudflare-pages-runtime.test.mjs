import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  createConsumptionReceipt,
  validateConsumptionReceipt,
} from "./production-break-glass-consumption.mjs";
import { selectReleaseAuthorization } from "./production-break-glass-validation.mjs";

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
    assert.ok(bindingVerification < liveVerification);
    assert.ok(liveVerification < currentMain && currentMain < patch);
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
});
