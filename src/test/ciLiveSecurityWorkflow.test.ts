import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ciWorkflow = readFileSync(
  join(process.cwd(), ".github", "workflows", "ci.yml"),
  "utf8",
);
const stagingWorkflow = readFileSync(
  join(process.cwd(), ".github", "workflows", "stage-release.yml"),
  "utf8",
);
const supabaseStagingWorkflow = readFileSync(
  join(process.cwd(), ".github", "workflows", "reusable-supabase-staging.yml"),
  "utf8",
);
const approvalWorkflow = readFileSync(
  join(process.cwd(), ".github", "workflows", "approve-production-release.yml"),
  "utf8",
);
const productionWorkflow = readFileSync(
  join(process.cwd(), ".github", "workflows", "deploy-production-release.yml"),
  "utf8",
);

describe("release-train live security workflow", () => {
  it("keeps release validation and consumption ahead of production secrets and mutations", () => {
    const authorization = productionWorkflow.indexOf(
      "Validate production deployment authorization",
    );
    const signingSecret = productionWorkflow.indexOf(
      "RELEASE_EVIDENCE_SIGNING_KEY: ${{ secrets.RELEASE_EVIDENCE_SIGNING_KEY }}",
    );
    const consume = productionWorkflow.indexOf(
      "consume-break-glass-authorization:",
    );
    const archive = productionWorkflow.indexOf("archive-production-source:");
    const database = productionWorkflow.indexOf("deploy-production-database:");

    expect(authorization).toBeGreaterThan(-1);
    expect(signingSecret).toBeGreaterThan(authorization);
    expect(consume).toBeGreaterThan(signingSecret);
    expect(archive).toBeGreaterThan(consume);
    expect(database).toBeGreaterThan(archive);
    expect(productionWorkflow).toContain("PRODUCTION_RELEASE_ENABLED");
    expect(productionWorkflow).toContain("PRODUCTION_RELEASE_DEPLOYERS");
  });

  it("keeps CI validation-only and starts staging only from a successful main push", () => {
    expect(ciWorkflow).toContain("uses: ./.github/workflows/reusable-release-safety.yml");
    expect(ciWorkflow).not.toContain("SUPABASE_ACCESS_TOKEN");
    expect(ciWorkflow).not.toContain("assert-staging-mutation-target.mjs");
    expect(stagingWorkflow).toContain('workflows: ["CI"]');
    expect(stagingWorkflow).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(stagingWorkflow).toContain('SOURCE_EVENT" != "push"');
    expect(stagingWorkflow).toContain('SOURCE_BRANCH" != "main"');
    expect(stagingWorkflow).toContain("Staging accepts only successful CI runs from a push to this repository's main branch.");
  });

  it("requires an exact-SHA lease and an isolated staging target before any staging security check", () => {
    expect(supabaseStagingWorkflow).toContain("Validate exact staging mutation lease");
    expect(supabaseStagingWorkflow).toContain("github-staging-lease");
    expect(supabaseStagingWorkflow).toContain(
      "Staging checkout SHA $actual_sha does not match the requested release SHA $RELEASE_SHA.",
    );
    expect(supabaseStagingWorkflow).toContain("Resolve Supabase staging target");
    expect(supabaseStagingWorkflow).toContain("An isolated staging Supabase project is required.");
    expect(supabaseStagingWorkflow).toContain("STAGING_SUPABASE_URL project ref does not match STAGING_SUPABASE_PROJECT_ID.");
    expect(supabaseStagingWorkflow).toContain("node scripts/assert-staging-mutation-target.mjs");
    expect(stagingWorkflow).toContain("MUTATE_STAGING_xsiehskfgeoqyazcgauv");
  });

  it("keeps live security, migration, and advisor checks gated to isolated staging", () => {
    const guard = "steps.supabase_changes.outputs.eligible == 'true' && steps.supabase_target.outputs.isolated_staging == 'true'";

    for (const stepName of [
      "Check staging Supabase advisors",
      "Check staging Supabase generated types",
      "Check staging Supabase security posture",
      "Verify exact staging migration and RPC contract",
    ]) {
      const escaped = stepName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(supabaseStagingWorkflow).toMatch(
        new RegExp(`- name: ${escaped}\\s+if: ${guard}`),
      );
    }

    expect(supabaseStagingWorkflow).toContain("npm run check:live-security-posture");
    expect(supabaseStagingWorkflow).toContain("npm run check:supabase-advisor -- --fail-on-error --fail-on-unknown");
    expect(supabaseStagingWorkflow).toContain("Create exact staging database attestation");
  });

  it("requires a verified immutable artifact before the dedicated staging deployment", () => {
    expect(stagingWorkflow).toContain("Verify source CI artifact");
    expect(stagingWorkflow).toContain("Release candidate file set or artifact digest mismatch.");
    expect(stagingWorkflow).toContain("Verify cryptographic build provenance");
    expect(stagingWorkflow).toContain("Verify immutable candidate again");
    expect(stagingWorkflow).toContain("Deploy exact artifact to dedicated staging project");
    expect(stagingWorkflow).toContain("--commit-hash=${{ needs.validate-source.outputs.release_sha }}");
  });

  it("uses GitHub Free compatible signed artifact bindings", () => {
    for (const workflow of [
      ciWorkflow,
      stagingWorkflow,
      supabaseStagingWorkflow,
      approvalWorkflow,
    ]) {
      expect(workflow).not.toContain("actions/attest-build-provenance@");
      expect(workflow).not.toContain("gh attestation verify");
    }
    for (const workflow of [ciWorkflow, approvalWorkflow]) {
      expect(workflow).not.toMatch(/^\s{4}environment:\s*\S+/m);
    }
    expect(stagingWorkflow).toContain("    environment: staging");
    expect(supabaseStagingWorkflow).toContain("    environment: staging");
    expect(ciWorkflow).toContain("production-release-candidate-binding-${{ github.sha }}-${{ github.run_attempt }}");
    expect(ciWorkflow).toContain("RELEASE_EVIDENCE_SIGNING_KEY: ${{ secrets.RELEASE_EVIDENCE_SIGNING_KEY }}");
    expect(ciWorkflow).toContain("--trusted-current-run-id \"$GITHUB_RUN_ID\"");
    expect(stagingWorkflow).toContain("github.event.workflow_run.run_attempt == 1");
    expect(stagingWorkflow).toContain(
      "release-candidate-attestation-${{ needs.validate-source.outputs.release_sha }}-${{ github.run_attempt }}-binding",
    );
    expect(stagingWorkflow).toContain("--workflow-path .github/workflows/stage-release.yml");
    expect(supabaseStagingWorkflow).toContain("production-release-candidate-binding-");
    expect(supabaseStagingWorkflow).toContain("node scripts/verify-release-artifact-binding.mjs");
    expect(approvalWorkflow).toContain("PRODUCTION_RELEASE_APPROVERS: ${{ vars.PRODUCTION_RELEASE_APPROVERS }}");
    expect(approvalWorkflow).toContain("The allowlisted approver must be independent from CI and staging producers.");
    expect(approvalWorkflow).toContain("production-release-approval-binding-");
  });

  it("proves live security against the exact staged app and Supabase project", () => {
    const preparation = stagingWorkflow.slice(
      stagingWorkflow.indexOf("- name: Prepare isolated staging security fixtures"),
      stagingWorkflow.indexOf("- name: Revalidate lease before destructive live security proof"),
    );

    expect(stagingWorkflow).toContain("staging-live-security:");
    expect(stagingWorkflow).toContain("name: Prove staged live security boundaries");
    expect(stagingWorkflow).toContain(
      "needs: [validate-source, supabase-staging, cloudflare-staging]",
    );
    expect(stagingWorkflow).toContain(
      "Revalidate lease before security fixture preparation",
    );
    expect(stagingWorkflow).toContain(
      "Revalidate lease before destructive live security proof",
    );
    expect(stagingWorkflow).toContain(
      "node scripts/assert-staging-mutation-target.mjs",
    );
    expect(stagingWorkflow).toContain(
      "node scripts/prepare-isolated-security-fixtures.mjs",
    );
    expect(preparation).toContain(
      "RLS_ADMIN_EMAIL: ${{ secrets.E2E_ADMIN_EMAIL }}",
    );
    expect(preparation).toContain(
      "RLS_ADMIN_PASSWORD: ${{ secrets.E2E_ADMIN_PASSWORD }}",
    );
    expect(stagingWorkflow).toContain(
      "E2E_ALLOWED_DESTRUCTIVE_PROJECT_REFS: ${{ secrets.STAGING_SUPABASE_PROJECT_ID }}",
    );
    expect(stagingWorkflow).toContain(
      "PLAYWRIGHT_BASE_URL: ${{ needs.cloudflare-staging.outputs.stable_url }}",
    );
    expect(stagingWorkflow).toContain(
      "PLAYWRIGHT_JSON_OUTPUT_FILE: staging-live-security-playwright.json",
    );
    for (const spec of [
      "e2e/rls-security.spec.ts",
      "e2e/gdpr-delete-account.spec.ts",
      "e2e/onboarding-role-selection.spec.ts",
    ]) {
      expect(stagingWorkflow).toContain(spec);
    }
    expect(stagingWorkflow).toContain(
      "node scripts/staging-live-security-evidence.mjs",
    );
    expect(stagingWorkflow).toContain("path: |");
    expect(stagingWorkflow).toContain("staging-live-security-proof.json");
    expect(stagingWorkflow).toContain("staging-live-security-playwright.json");
  });

  it("binds minimized live security evidence into the final exact-SHA attestation", () => {
    expect(stagingWorkflow).toContain("      - staging-live-security");
    expect(stagingWorkflow).toContain(
      'artifact_name="staging-live-security-${RELEASE_SHA}-${GITHUB_RUN_ATTEMPT}"',
    );
    expect(stagingWorkflow).toContain(
      "name: ${{ steps.evidence.outputs.artifact_name }}",
    );
    expect(stagingWorkflow).toContain(
      'const securityEvidence = read("evidence/security/staging-live-security-proof.json");',
    );
    expect(stagingWorkflow).toContain("schema_version: 4");
    expect(stagingWorkflow).toContain("security: securityEvidence.sha256");
    expect(stagingWorkflow).toContain(
      'security.evidence_type !== "maiprop-staging-live-security"',
    );
    expect(stagingWorkflow).toContain(
      "security.target?.supabase_project_ref !== database.project_ref",
    );
    expect(stagingWorkflow).toContain("security.playwright?.skipped !== 0");
  });
});
