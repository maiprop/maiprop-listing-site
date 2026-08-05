import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";

const productionWorkflow = readFileSync(".github/workflows/deploy-supabase-production-db.yml", "utf8");
const stagingWorkflow = readFileSync(".github/workflows/reusable-supabase-staging.yml", "utf8");

describe("production DB advisor workflow", () => {
  it("promotes exact staged migrations and applies the same hard production gates", () => {
    const parsed = yaml.load(productionWorkflow) as {
      concurrency?: unknown;
      jobs: {
        deploy: {
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

    expect(productionWorkflow).toContain("workflow_call:");
    expect(productionWorkflow).not.toContain("workflow_dispatch:");
    expect(parsed.concurrency).toBeUndefined();
    expect(productionWorkflow).toContain("environment: production");
    expect(productionWorkflow).toContain('PRODUCTION_PROJECT_REF: "qvvicunqcrwpioqnvzxf"');
    expect(productionWorkflow).toContain("Download immutable release candidate");
    expect(productionWorkflow).toContain("Verify signed staging release attestation");
    expect(productionWorkflow).toContain("Validate current production mutation lease");
    expect(productionWorkflow).toContain("Capture production migration history");
    expect(productionWorkflow).toContain("assertMigrationPromotionPlan");
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
    expect(stagingWorkflow).toContain("--workdir release-candidate db push");
    expect(stagingWorkflow).toContain("npm run check:supabase-advisor -- --fail-on-error --fail-on-unknown");
  });
});
