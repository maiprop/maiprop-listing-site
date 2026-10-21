import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";

const productionWorkflow = readFileSync(".github/workflows/deploy-supabase-production-db.yml", "utf8");
const stagingWorkflow = readFileSync(".github/workflows/reusable-supabase-staging.yml", "utf8");

describe("production DB advisor workflow", () => {
  it("promotes exact staged migrations and applies the same hard production gates", () => {
    const parsed = yaml.load(productionWorkflow) as {
      on: {
        workflow_call: {
          secrets?: Record<string, { required: boolean }>;
        };
      };
      concurrency?: unknown;
      permissions?: Record<string, string>;
      jobs: {
        deploy: {
          environment?: unknown;
          steps: Array<{
            name?: string;
            env?: Record<string, string>;
            run?: string;
          }>;
        };
      };
    };
    const terminalEvidence = parsed.jobs.deploy.steps.find(
      (step) => step.name === "Create production database terminal evidence",
    );
    const applyStep = stagingWorkflow.indexOf("- name: Apply database migrations to staging");
    const postApplyStats = stagingWorkflow.indexOf("- name: Capture staging Supabase index stats");
    const postApplyAdvisor = stagingWorkflow.indexOf("- name: Check staging Supabase advisors");
    const canonicalHistoryGate = productionWorkflow.indexOf(
      "- name: Require canonical migration history before production mutation",
    );
    const productionDryRun = productionWorkflow.indexOf(
      "- name: Dry-run exact staged production migrations",
    );
    const productionApply = productionWorkflow.indexOf(
      "- name: Apply exact staged production migrations",
    );

    expect(productionWorkflow).toContain("workflow_call:");
    expect(productionWorkflow).not.toContain("workflow_dispatch:");
    expect(parsed.concurrency).toBeUndefined();
    expect(parsed.jobs.deploy.environment).toBe("production");
    expect(parsed.permissions).toEqual({ actions: "read", contents: "read" });
    expect(parsed.on.workflow_call.secrets?.SUPABASE_PRODUCTION_DB_URL).toBeUndefined();
    expect(productionWorkflow).toContain(
      "SUPABASE_PRODUCTION_DB_URL: ${{ secrets.SUPABASE_PRODUCTION_DB_URL }}",
    );
    expect(parsed.on.workflow_call.secrets?.RELEASE_EVIDENCE_SIGNING_KEY).toEqual({
      required: true,
    });
    expect(productionWorkflow).toContain('PRODUCTION_PROJECT_REF: "qvvicunqcrwpioqnvzxf"');
    expect(productionWorkflow).toContain("Download immutable release candidate");
    expect(productionWorkflow).toContain("Verify signed provider artifact bindings");
    expect(productionWorkflow).toContain("Validate current production mutation lease");
    expect(productionWorkflow).toContain("Capture production migration history");
    expect(canonicalHistoryGate).toBeGreaterThan(-1);
    expect(canonicalHistoryGate).toBeLessThan(productionDryRun);
    expect(canonicalHistoryGate).toBeLessThan(productionApply);
    expect(productionWorkflow).toContain(
      "production-migration-history-reconciliation.json",
    );
    expect(productionWorkflow).toContain("staging_is_exact_candidate");
    expect(productionWorkflow).toContain("production_is_canonical_prefix");
    expect(productionWorkflow).toContain("same_name_version_drift");
    expect(productionWorkflow).toContain("cardinality(statements) = 1");
    expect(productionWorkflow).toContain("statements[1] = version || '_'");
    expect(productionWorkflow).toContain("production_repair_markers");
    expect(productionWorkflow).toContain("production_execution_drift");
    expect(productionWorkflow).toContain("'statements_sha256', encode(");
    expect(productionWorkflow).toContain("public.digest(");
    expect(productionWorkflow).toContain(
      "expected.statements_sha256 !== migration.statements_sha256",
    );
    expect(productionWorkflow).toContain(
      "filename-only schema_migrations statement is not execution proof",
    );
    expect(productionWorkflow).toContain("reconcileMigrationHistories");
    expect(productionWorkflow).toContain(
      "Capture production legacy schema evidence before mutation",
    );
    expect(productionWorkflow).toContain(
      "Require exact legacy schema convergence with staging",
    );
    expect(productionWorkflow).toContain(
      "validateLegacyMigrationSchemaEvidence",
    );
    expect(productionWorkflow).toContain(
      "legacy_migration_schema_evidence_sha256",
    );
    expect(productionWorkflow).toContain(
      "release-candidate/supabase/reconciliation/production-history-v1.json",
    );
    expect(productionWorkflow).toContain(
      "Canonical migration history reconciliation is required before any production mutation.",
    );
    expect(productionWorkflow).not.toContain("supabase migration repair");
    expect(productionWorkflow).not.toContain("assertMigrationPromotionPlan");
    expect(productionWorkflow).toContain("assertMigrationDryRunParity");
    expect(productionWorkflow).toContain(
      "Revalidate current main and mutation lease before database apply",
    );
    expect(productionWorkflow).toContain(
      "npx --no-install supabase --workdir release-candidate db push",
    );
    expect(productionWorkflow).toContain("--dry-run");
    expect(productionWorkflow).toContain("--yes");
    expect(productionWorkflow).toContain(
      "npm run check:supabase-advisor -- --fail-on-error --fail-on-unknown",
    );
    expect(productionWorkflow).toContain("npm run check:supabase-types -- -- --strict");
    expect(productionWorkflow).toContain("npm run capture:supabase-index-stats");
    expect(productionWorkflow).toContain("npm run check:live-security-posture");
    expect(productionWorkflow).toContain("db lint");
    expect(productionWorkflow).toContain("production-supabase-db-attestation");
    expect(productionWorkflow).toContain("scripts/verify-release-artifact-binding.mjs");
    expect(productionWorkflow).toContain("scripts/create-release-artifact-binding.mjs");
    expect(productionWorkflow).toContain(
      "Create signed production database terminal binding",
    );
    expect(productionWorkflow).not.toContain("actions/attest-build-provenance@");
    expect(productionWorkflow).not.toContain("gh attestation");
    expect(productionWorkflow).not.toContain("attestations: write");
    expect(productionWorkflow).not.toContain("id-token: write");
    expect(productionWorkflow).not.toContain("artifact-metadata: write");
    expect(productionWorkflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(terminalEvidence?.env?.SUPABASE_PRODUCTION_DB_URL).toBe(
      "${{ secrets.SUPABASE_PRODUCTION_DB_URL }}",
    );
    expect(terminalEvidence?.run).toContain('psql "$SUPABASE_PRODUCTION_DB_URL"');
    expect(terminalEvidence?.run).toContain("production-migrations-terminal.json");
    expect(terminalEvidence?.run).toContain("production_history_capture_status");
    expect(applyStep).toBeGreaterThan(-1);
    expect(postApplyStats).toBeGreaterThan(applyStep);
    expect(postApplyAdvisor).toBeGreaterThan(postApplyStats);
    expect(stagingWorkflow).toContain("node scripts/assert-staging-mutation-target.mjs");
    expect(stagingWorkflow).toContain("staging-migration-history.json");
    expect(stagingWorkflow).toContain("'statements_sha256', encode(");
    expect(stagingWorkflow).toContain("lacks verified executed SQL history");
    expect(stagingWorkflow).toContain("--workdir release-candidate db push");
    expect(stagingWorkflow).toContain("npm run check:supabase-advisor -- --fail-on-error --fail-on-unknown");
  });
});
