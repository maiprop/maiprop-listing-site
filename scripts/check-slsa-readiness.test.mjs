import { afterEach, describe, expect, it } from "vitest";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { checkSlsaReadiness } from "./check-slsa-readiness.mjs";

const roots = [];
const requiredFiles = [
  ".github/workflows/ci.yml",
  ".github/workflows/stage-release.yml",
  ".github/workflows/approve-production-release.yml",
  ".github/workflows/reusable-supabase-staging.yml",
  ".github/workflows/deploy-production-release.yml",
  ".github/workflows/direct-cloudflare-production-deploy.yml",
  ".github/workflows/reusable-cloudflare-production-deploy.yml",
  "scripts/release-artifact-binding.mjs",
  "scripts/create-release-artifact-binding.mjs",
  "scripts/verify-release-artifact-binding.mjs",
];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "maiprop-slsa-binding-"));
  roots.push(root);
  for (const relativePath of requiredFiles) {
    const target = join(root, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(process.cwd(), relativePath), target);
  }
  return root;
}

function rewrite(root, relativePath, transform) {
  const path = join(root, relativePath);
  writeFileSync(path, transform(readFileSync(path, "utf8")));
}

describe("GitHub Free private-repository release provenance readiness", () => {
  it("accepts the repository HMAC binding and GitHub artifact API contract", () => {
    const readiness = checkSlsaReadiness(process.cwd());
    expect(readiness.failures).toEqual([]);
    expect(readiness.summary.bindingWorkflowFiles).toEqual([
      ".github/workflows/approve-production-release.yml",
      ".github/workflows/ci.yml",
      ".github/workflows/deploy-production-release.yml",
      ".github/workflows/direct-cloudflare-production-deploy.yml",
      ".github/workflows/reusable-cloudflare-production-deploy.yml",
      ".github/workflows/reusable-supabase-staging.yml",
      ".github/workflows/stage-release.yml",
    ]);
    expect(readiness.summary.githubFreePrivateEnvironmentControls).toEqual({
      active: false,
      purpose: "deployment attribution and paid-plan scope only",
    });
  });

  it("fails closed when signing-key ownership or same-run controls are removed", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/ci.yml",
      (source) => source
        .replaceAll("RELEASE_EVIDENCE_SIGNING_KEY", "REMOVED_SIGNING_KEY")
        .replaceAll("--same-run", "--removed-same-run"),
    );
    const readiness = checkSlsaReadiness(root);
    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(/signing key|same-run/i);
  });

  it("fails closed when exact-SHA HMAC artifact binding names drift", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/stage-release.yml",
      (source) => source.replace(
        "release-candidate-attestation-${{ needs.validate-source.outputs.release_sha }}-${{ github.run_attempt }}-binding",
        "release-candidate-attestation-binding-${{ needs.validate-source.outputs.release_sha }}-${{ github.run_attempt }}",
      ),
    );
    rewrite(
      root,
      ".github/workflows/approve-production-release.yml",
      (source) => source.replace(
        'binding_name="release-candidate-attestation-${RELEASE_SHA}-${STAGING_RUN_ATTEMPT}-binding"',
        'binding_name="release-candidate-attestation-binding-${RELEASE_SHA}-${STAGING_RUN_ATTEMPT}"',
      ),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(/exact.*binding|release-candidate-attestation/i);
  });

  it("fails closed when attempt-one actor equality is removed", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/approve-production-release.yml",
      (source) => source
        .replace("github.run_attempt == 1", "true")
        .replace("github.actor == github.triggering_actor", "true"),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(/run_attempt|triggering_actor|attempt-one actor/i);
  });

  it("fails closed when artifact ID or digest binding is removed", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/approve-production-release.yml",
      (source) => source
        .replaceAll('--artifact-id "$APPROVAL_ARTIFACT_ID"', "--removed-artifact-id")
        .replaceAll('--artifact-digest "$APPROVAL_ARTIFACT_DIGEST"', "--removed-artifact-digest"),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(/artifact-id|artifact-digest|artifact identity/i);
  });

  it("fails closed when the signed approval is not bound to the exact workflow SHA", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/approve-production-release.yml",
      (source) => source.replaceAll('--workflow-sha "$GITHUB_WORKFLOW_SHA"', "--removed-workflow-sha"),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(/workflow-sha|exact.*SHA/i);
  });

  it("fails closed when staging is not pinned to the exact candidate workflow SHA", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/stage-release.yml",
      (source) => source.replace(
        "github.workflow_sha == github.event.workflow_run.head_sha",
        "true",
      ),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(/workflow_sha|exact.*SHA/i);
  });

  it("fails closed when approval no longer proves the release is current main", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/approve-production-release.yml",
      (source) => source.replace(
        '[ "$CURRENT_MAIN" != "$RELEASE_SHA" ]',
        "false",
      ),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(/CURRENT_MAIN|current main/i);
  });

  it("fails closed when approval independence is removed", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/approve-production-release.yml",
      (source) => source.replace(
        "The allowlisted approver must be independent from CI and staging producers.",
        "Approval accepted.",
      ),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(/independent/i);
  });

  it("fails closed when direct Cloudflare recovery loses attempt-one actor equality", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/direct-cloudflare-production-deploy.yml",
      (source) => source
        .replace("github.run_attempt == 1", "true")
        .replace("github.actor == github.triggering_actor", "true")
        .replace("github.run_attempt != 1", "false")
        .replace("github.actor != github.triggering_actor", "false"),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(/direct-cloudflare|run_attempt|triggering_actor/i);
  });

  it("fails closed when Cloudflare Pages deployment is not pinned to the exact release SHA", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/reusable-cloudflare-production-deploy.yml",
      (source) => source
        .replace('--commit-hash="$RELEASE_SHA"', "--commit-hash=main")
        .replace("--commit-dirty=false", "--commit-dirty=true"),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(/commit-hash|commit-dirty|exact release SHA/i);
  });

  it("fails closed when the Cloudflare mutation lease loses artifact ID or digest verification", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/reusable-cloudflare-production-deploy.yml",
      (source) => source
        .replace('artifact_id="$(jq -er \'.artifact.id\' "$binding")"', "artifact_id=unbound")
        .replace('artifact_digest="$(jq -er \'.digest\' "$metadata")"', "artifact_digest=unbound"),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(/artifact_id|artifact_digest|artifact identity/i);
  });

  it("fails closed when the Cloudflare mutation lease is no longer verified as same-run", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/reusable-cloudflare-production-deploy.yml",
      (source) => source.replace(
        '"$PRODUCTION_RUN_ID" "$PRODUCTION_RUN_ATTEMPT" same-run',
        '"$PRODUCTION_RUN_ID" "$PRODUCTION_RUN_ATTEMPT" prior-run',
      ),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(/mutation lease|same-run/i);
  });

  it("fails closed when Cloudflare no longer revalidates independent approval against the deployer", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/reusable-cloudflare-production-deploy.yml",
      (source) => source
        .replaceAll('--deploy-actor "$GITHUB_ACTOR"', '--deploy-actor "$DEPLOY_ACTOR"')
        .replaceAll('--allowed-approvers "$ALLOWED_APPROVERS"', '--allowed-approvers "$ALLOWED_DEPLOYERS"'),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(/deploy-actor|allowed-approvers|independent approval/i);
  });

  it("fails closed when the reusable Cloudflare contract drops a required run-tuple input", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/reusable-cloudflare-production-deploy.yml",
      (source) => source.replace(
        /      production_run_attempt:\r?\n        required: true\r?\n        type: string\r?\n/,
        "",
      ),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(/production_run_attempt|required reusable input/i);
  });

  it("fails closed when coordinated production evidence loses its exact-SHA HMAC binding", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/deploy-production-release.yml",
      (source) => source.replace(
        "production-release-attestation-${{ inputs.release_sha }}-${{ github.run_id }}-${{ github.run_attempt }}-binding",
        "production-release-attestation-binding-${{ github.run_id }}",
      ),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(/production-release-attestation|exact.*binding/i);
  });

  it("rejects legacy attestation and environment controls in Cloudflare production workflows", () => {
    const root = fixture();
    const workflowPath = join(root, ".github/workflows/reusable-cloudflare-production-deploy.yml");
    writeFileSync(
      workflowPath,
      `${readFileSync(workflowPath, "utf8")}\n` +
        "# actions/attest-build-provenance@floating\n" +
        "# gh attestation verify\n" +
        "    environment: production\n" +
        "      id-token: write\n",
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(/attestation|environment|OIDC/i);
  });

  it("rejects reintroduced GitHub attestation or OIDC dependencies in staging workflows", () => {
    const root = fixture();
    const stagePath = join(root, ".github/workflows/stage-release.yml");
    writeFileSync(
      stagePath,
      `${readFileSync(stagePath, "utf8")}\n` +
        "# actions/attest-build-provenance@floating\n" +
        "# gh attestation verify\n" +
        "      id-token: write\n",
    );
    const readiness = checkSlsaReadiness(root);
    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(/attestation|OIDC/i);
  });

  it("rejects staging environment scope on a reusable caller job", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/stage-release.yml",
      (source) => source.replace(
        "  supabase-staging:\n    name: Stage Supabase exact SHA",
        "  supabase-staging:\n    name: Stage Supabase exact SHA\n    environment: staging",
      ),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(
      /supabase-staging.*environment|environment.*supabase-staging/i,
    );
  });

  it("rejects an unclassified stage-release job without an environment", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/stage-release.yml",
      (source) => `${source.trimEnd()}\n\n` +
        "  unknown-unscoped-job:\n" +
        "    name: Unknown unscoped job\n" +
        "    runs-on: ubuntu-latest\n" +
        "    steps:\n" +
        "      - run: echo unclassified\n",
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(
      /unknown-unscoped-job.*not explicitly classified/i,
    );
  });

  it("rejects an unclassified stage-release job even when it uses staging", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/stage-release.yml",
      (source) => `${source.trimEnd()}\n\n` +
        "  unknown-staging-job:\n" +
        "    name: Unknown staging job\n" +
        "    environment: staging\n" +
        "    runs-on: ubuntu-latest\n" +
        "    steps:\n" +
        "      - run: echo unclassified\n",
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(
      /unknown-staging-job.*not explicitly classified/i,
    );
  });

  it("rejects an unclassified stage-release job assigned to another environment", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/stage-release.yml",
      (source) => `${source.trimEnd()}\n\n` +
        "  unknown-mis-scoped-job:\n" +
        "    name: Unknown mis-scoped job\n" +
        "    environment: production\n" +
        "    runs-on: ubuntu-latest\n" +
        "    steps:\n" +
        "      - run: echo unclassified\n",
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(
      /unknown-mis-scoped-job.*not explicitly classified/i,
    );
  });

  it("rejects a renamed stage-release job until its classification changes", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/stage-release.yml",
      (source) => source.replace(
        "  staging-business-proofs:\n",
        "  renamed-staging-business-proofs:\n",
      ),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(
      /renamed-staging-business-proofs.*not explicitly classified/i,
    );
    expect(readiness.failures.join("\n")).toMatch(
      /classified job staging-business-proofs is missing/i,
    );
  });

  it("requires staging environment scope on mutation and evidence jobs", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/stage-release.yml",
      (source) => source.replace(
        "  cloudflare-staging:\n    name: Stage Cloudflare exact artifact\n    environment: staging",
        "  cloudflare-staging:\n    name: Stage Cloudflare exact artifact",
      ),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(
      /cloudflare-staging.*environment|environment.*cloudflare-staging/i,
    );
  });

  it("rejects a classified staging job assigned to another environment", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/stage-release.yml",
      (source) => source.replace(
        "  cloudflare-staging:\n    name: Stage Cloudflare exact artifact\n    environment: staging",
        "  cloudflare-staging:\n    name: Stage Cloudflare exact artifact\n    environment: production",
      ),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(
      /cloudflare-staging.*staging environment/i,
    );
  });
});
