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

describe("release-train live security workflow", () => {
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
    expect(supabaseStagingWorkflow).toContain("Staging checkout SHA $actual_sha does not match the requested release SHA.");
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

  it("proves live security against the exact staged app and Supabase project", () => {
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
    expect(stagingWorkflow).toContain(
      "path: staging-live-security-proof.json",
    );
    expect(stagingWorkflow).not.toContain(
      "path: staging-live-security-playwright.json",
    );
  });

  it("binds minimized live security evidence into the final exact-SHA attestation", () => {
    expect(stagingWorkflow).toContain("      - staging-live-security");
    expect(stagingWorkflow).toContain(
      "name: staging-live-security-${{ needs.validate-source.outputs.release_sha }}",
    );
    expect(stagingWorkflow).toContain(
      'const securityEvidence = read("evidence/security/staging-live-security-proof.json");',
    );
    expect(stagingWorkflow).toContain("schema_version: 2");
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
