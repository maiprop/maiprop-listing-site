import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const result = (failures, summary = {}) => ({
  ok: failures.length === 0,
  failures,
  summary,
});

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

const rejectUnsupportedControls = (failures, path, text) => {
  if (text === null) return;
  for (const [pattern, label] of [
    [/actions\/attest-build-provenance@/i, "GitHub build attestations"],
    [/\bgh\s+attestation\b/i, "gh attestation verification"],
    [/^\s{4}environment\s*:/m, "GitHub Environment job gates"],
    [/^\s+(?:attestations|artifact-metadata|id-token):\s*(?:read|write)\b/mi, "attestation/OIDC permissions"],
  ]) {
    if (pattern.test(text)) failures.push(`${path} must not depend on ${label}`);
  }
};

export function checkSlsaReadiness(root = process.cwd()) {
  const failures = [];
  const paths = {
    ci: ".github/workflows/ci.yml",
    stage: ".github/workflows/stage-release.yml",
    approval: ".github/workflows/approve-production-release.yml",
    supabase: ".github/workflows/reusable-supabase-staging.yml",
    production: ".github/workflows/deploy-production-release.yml",
    directCloudflare: ".github/workflows/direct-cloudflare-production-deploy.yml",
    reusableCloudflare: ".github/workflows/reusable-cloudflare-production-deploy.yml",
    binding: "scripts/release-artifact-binding.mjs",
    create: "scripts/create-release-artifact-binding.mjs",
    verify: "scripts/verify-release-artifact-binding.mjs",
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
  ]);
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
    rejectUnsupportedControls(failures, paths[name], texts[name]);
  }

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
  return result(failures, { bindingWorkflowFiles });
}

const main = () => {
  const check = checkSlsaReadiness(process.cwd());
  if (!check.ok) {
    for (const failure of check.failures) process.stderr.write(`${failure}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write("GitHub Free release artifact binding readiness OK\n");
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(fileURLToPath(import.meta.url)).href &&
  process.argv[1].endsWith("check-slsa-readiness.mjs")
) {
  main();
}
