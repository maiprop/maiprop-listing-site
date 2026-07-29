import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const releaseSafetyWorkflow = readFileSync(
  ".github/workflows/reusable-release-safety.yml",
  "utf8",
);

const ciWorkflow = readFileSync(
  ".github/workflows/ci.yml",
  "utf8",
);

const advisorReportWorkflow = readFileSync(
  ".github/workflows/supabase-advisor-report.yml",
  "utf8",
);

const supabaseStagingWorkflow = readFileSync(
  ".github/workflows/reusable-supabase-staging.yml",
  "utf8",
);

const advisorScript = readFileSync(
  "scripts/check-supabase-advisor.mjs",
  "utf8",
);

const advisorHttpHelper = readFileSync(
  "scripts/supabase-advisor-http.mjs",
  "utf8",
);

const indexStatsScript = readFileSync(
  "scripts/capture-supabase-index-stats.mjs",
  "utf8",
);

const supabaseTypesScript = readFileSync(
  "scripts/check-supabase-types-freshness.cjs",
  "utf8",
);

const liveSecurityScript = readFileSync(
  "scripts/check-live-security-posture.mjs",
  "utf8",
);

describe("Supabase index stats workflow wiring", () => {
  it("keeps release safety validation-only while staging captures isolated index evidence", () => {
    expect(releaseSafetyWorkflow).toContain("npm run check:release-safety -- --out release-safety-inventory.json");
    expect(releaseSafetyWorkflow).not.toContain("SUPABASE_PRODUCTION_DB_URL");
    expect(advisorReportWorkflow).toContain(
      "SUPABASE_PRODUCTION_DB_URL: ${{ secrets.SUPABASE_PRODUCTION_DB_URL }}",
    );
    expect(advisorReportWorkflow).toContain(
      "npm run capture:supabase-index-stats -- --out supabase-index-stats.json --allow-empty-when-unconfigured",
    );
    expect(supabaseStagingWorkflow).toContain("Capture staging Supabase index stats");
    expect(supabaseStagingWorkflow).toContain(
      "SUPABASE_PROJECT_REF: ${{ secrets.STAGING_SUPABASE_PROJECT_ID }}",
    );
  });

  it("captures enough index metadata to review unused-index risk cautiously", () => {
    expect(indexStatsScript).toContain("from pg_stat_user_indexes s");
    expect(indexStatsScript).not.toContain("where schemaname = 'public'");
    expect(indexStatsScript).toContain("pg_index i");
    expect(indexStatsScript).toContain("from pg_constraint con");
    expect(indexStatsScript).toContain("where con.conindid = s.indexrelid");
    expect(indexStatsScript).toContain("table_writes");
    expect(indexStatsScript).toContain("is_primary");
    expect(indexStatsScript).toContain("is_unique");
    expect(indexStatsScript).toContain("has_constraint");
  });

  it("keeps weekly unused-index reports long enough for trend review", () => {
    expect(advisorReportWorkflow).toContain("retention-days: 90");
    expect(advisorReportWorkflow).toContain("Managed-schema indexes, do not drop from advisor alone");
    expect(advisorReportWorkflow).toContain("Protected constraint/unique indexes, do not drop");
    expect(advisorReportWorkflow).toContain("Public write-path candidates needing query-plan review");
  });

  it("keeps the reusable release inventory validation-only and advisor gates strict", () => {
    expect(releaseSafetyWorkflow).not.toContain("--allow-transient-unavailable");
    expect(releaseSafetyWorkflow).not.toContain("check:supabase-advisor");
    expect(advisorReportWorkflow).not.toContain("--allow-transient-unavailable");
    expect(supabaseStagingWorkflow).toContain(
      "npm run check:supabase-advisor -- --fail-on-error --fail-on-unknown",
    );
  });

  it("records transient Supabase advisor timeouts without weakening real advisor debt gates", () => {
    expect(advisorScript).toContain("allowTransientUnavailable");
    expect(advisorScript).toContain("isTransientAdvisorFailure");
    expect(advisorScript).toContain("isPerformanceAdvisorInternalSyntaxFailure");
    expect(advisorScript).toContain("transient_advisor_unavailable");
    expect(advisorScript).toContain("throw new Error");
    expect(advisorScript).toContain("failOnError && failingLintCount > 0");
    expect(advisorScript).toContain("assertAdvisorDebtIsActionable(advisorDebt)");
    expect(advisorHttpHelper).toContain("function isTransientAdvisorFailure");
    expect(advisorHttpHelper).toContain("status === 544");
    expect(advisorHttpHelper).toContain("function isPerformanceAdvisorInternalSyntaxFailure");
    expect(advisorHttpHelper).toContain('category === "performance"');
    expect(advisorHttpHelper).toContain("ERROR:\\s*42601");
  });

  it("records transient Supabase type-generation failures without suppressing stale generated types", () => {
    expect(supabaseTypesScript).toContain("allowTransientUnavailable");
    expect(supabaseTypesScript).toContain("isTransientTypesFailure");
    expect(supabaseTypesScript).toContain("error code:\\s*(?:520|522|524|504)");
    expect(supabaseTypesScript).toContain("generated types check was transiently unavailable");
    expect(supabaseTypesScript).toContain("normalize(current) !== normalize(generated)");
    expect(supabaseTypesScript).toContain("src/integrations/supabase/types.ts is stale");
  });

  it("keeps the generated type size review threshold above the current reviewed schema output", () => {
    expect(ciWorkflow).toContain("REVIEW_THRESHOLD=5500");
    expect(ciWorkflow).toContain('if [ "$LINES" -gt "$REVIEW_THRESHOLD" ]; then');
    expect(ciWorkflow).toContain("threshold: $REVIEW_THRESHOLD");
  });

  it("allows transient live-security posture timeouts without suppressing posture failures", () => {
    expect(liveSecurityScript).toContain("allowTransientUnavailable");
    expect(liveSecurityScript).toContain("isTransientManagementFailure");
    expect(liveSecurityScript).toContain("status, text");
    expect(liveSecurityScript).toContain("process.exit(0)");
    expect(liveSecurityScript).toContain("fail(\"posture check failed\", failures)");
  });

  it("requires an exact staging lease and isolated target before migration reconciliation", () => {
    expect(supabaseStagingWorkflow).toContain("Validate exact staging mutation lease");
    expect(supabaseStagingWorkflow).toContain("github-staging-lease");
    expect(supabaseStagingWorkflow).toContain("Staging checkout SHA $actual_sha does not match the requested release SHA.");
    expect(supabaseStagingWorkflow).toContain('echo "eligible=true" >> "$GITHUB_OUTPUT"');
    expect(supabaseStagingWorkflow).toContain('echo "deploy=true" >> "$GITHUB_OUTPUT"');
    expect(supabaseStagingWorkflow).toContain('echo "db_changes=true" >> "$GITHUB_OUTPUT"');
    expect(supabaseStagingWorkflow).toContain("Resolve Supabase staging target");
    expect(supabaseStagingWorkflow).toContain("An isolated staging Supabase project is required.");
    expect(supabaseStagingWorkflow).toContain("STAGING_SUPABASE_URL project ref does not match STAGING_SUPABASE_PROJECT_ID.");
    expect(supabaseStagingWorkflow).toContain("node scripts/assert-staging-mutation-target.mjs");
    expect(supabaseStagingWorkflow).toContain('if [ -z "$SUPABASE_STAGING_DB_URL" ]; then');
    expect(supabaseStagingWorkflow).toContain(
      "SUPABASE_STAGING_DB_URL is required for isolated staging schema verification",
    );
    expect(supabaseStagingWorkflow).toMatch(
      /- name: Check staging database migration secret\s+if: steps\.supabase_changes\.outputs\.eligible == 'true' && steps\.supabase_target\.outputs\.isolated_staging == 'true'[\s\S]*SUPABASE_STAGING_DB_URL is required for isolated staging schema verification\./,
    );
    expect(supabaseStagingWorkflow).toMatch(
      /- name: Resolve staging database URL\s+if: steps\.supabase_changes\.outputs\.eligible == 'true' && steps\.supabase_target\.outputs\.isolated_staging == 'true'[\s\S]*if \[ -z "\$SUPABASE_STAGING_DB_URL" \]; then[\s\S]*SUPABASE_STAGING_EFFECTIVE_DB_URL=[\s\S]*isolated staging schema verification cannot continue\.[\s\S]*exit 1/,
    );
    expect(supabaseStagingWorkflow).toContain("https://api.supabase.com/v1/projects/$STAGING_SUPABASE_PROJECT_ID");
    expect(supabaseStagingWorkflow).toContain("PROJECT_JSON=\"$project_json\"");
    expect(supabaseStagingWorkflow).toContain("const region = project?.region || projectMetadata.region");
    expect(supabaseStagingWorkflow).toContain(
      "Configure SUPABASE_STAGING_DB_URL as a Supabase pooler URL",
    );
    expect(supabaseStagingWorkflow).toContain("if (current.hostname.endsWith(\".pooler.supabase.com\"))");
    expect(supabaseStagingWorkflow).toContain("pooler.hostname = `aws-0-${region}.pooler.supabase.com`");
    expect(supabaseStagingWorkflow).not.toContain(
      "direct Supabase DB hostname, which is IPv6-only",
    );
    expect(supabaseStagingWorkflow).not.toContain(
      "Containerized migration validation remains the hard gate for this PR",
    );
    expect(supabaseStagingWorkflow).toMatch(
      /- name: Capture staging Supabase index stats\s+if: steps\.supabase_changes\.outputs\.eligible == 'true' && steps\.supabase_target\.outputs\.isolated_staging == 'true'\s+run: npm run capture:supabase-index-stats -- --out supabase-index-stats\.json/,
    );
    expect(supabaseStagingWorkflow).toMatch(
      /- name: Check staging Supabase advisors\s+if: steps\.supabase_changes\.outputs\.eligible == 'true' && steps\.supabase_target\.outputs\.isolated_staging == 'true'/,
    );
    expect(supabaseStagingWorkflow).toMatch(
      /- name: Check staging Supabase generated types\s+if: steps\.supabase_changes\.outputs\.eligible == 'true' && steps\.supabase_target\.outputs\.isolated_staging == 'true'/,
    );
  });

  it("reconciles every exact-SHA candidate in the isolated staging runtime", () => {
    const paritySteps = [
      "Validate isolated staging secrets",
      "Install Supabase CLI",
      "Revalidate staging lease before legacy migration repair",
      "Preview reviewed staging migration alias repairs",
      "Revalidate staging lease before reviewed alias repair",
      "Apply reviewed staging migration alias repairs",
      "Revalidate staging lease before add-on migration repair",
      "Repair staging add-on credit migration drift",
      "Dry-run staging database migrations",
      "Apply database migrations to staging",
      "Check staging Supabase security posture",
      "Deploy edge functions to staging",
      "Capture staging live function drift inventory",
    ];

    for (const stepName of paritySteps) {
      const escapedStepName = stepName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(supabaseStagingWorkflow).toMatch(
        new RegExp(`- name: ${escapedStepName}\\s+if: steps\\.supabase_changes\\.outputs\\.eligible == 'true' && steps\\.supabase_target\\.outputs\\.isolated_staging == 'true'`),
      );
    }
  });

  it("reconciles staging-only migration aliases before staging dry-run validation", () => {
    const checkStep = supabaseStagingWorkflow.indexOf("- name: Preview reviewed staging migration alias repairs");
    const repairStep = supabaseStagingWorkflow.indexOf("- name: Apply reviewed staging migration alias repairs");
    const dryRunStep = supabaseStagingWorkflow.indexOf("- name: Dry-run staging database migrations");

    expect(checkStep).toBeGreaterThan(-1);
    expect(repairStep).toBeGreaterThan(checkStep);
    expect(dryRunStep).toBeGreaterThan(-1);
    expect(repairStep).toBeLessThan(dryRunStep);

    expect(supabaseStagingWorkflow).toContain(
      "node scripts/reconcile-staging-migration-aliases.mjs --apply",
    );
    expect(supabaseStagingWorkflow).toContain(
      "PRODUCTION_SUPABASE_PROJECT_ID: ${{ inputs.production_supabase_project_id }}",
    );
    expect(supabaseStagingWorkflow).toContain(
      "STAGING_SUPABASE_PROJECT_ID: ${{ secrets.STAGING_SUPABASE_PROJECT_ID }}",
    );
  });

  it("repairs an applied add-on credit migration when staging is missing its canonical columns", () => {
    const repairStep = supabaseStagingWorkflow.indexOf("- name: Repair staging add-on credit migration drift");
    const dryRunStep = supabaseStagingWorkflow.indexOf("- name: Dry-run staging database migrations");

    expect(repairStep).toBeGreaterThan(-1);
    expect(dryRunStep).toBeGreaterThan(-1);
    expect(repairStep).toBeLessThan(dryRunStep);
    expect(supabaseStagingWorkflow).toContain("information_schema.columns");
    expect(supabaseStagingWorkflow).toContain("credits_granted");
    expect(supabaseStagingWorkflow).toContain("credits_consumed");
    expect(supabaseStagingWorkflow).toContain("supabase_migrations.schema_migrations");
    expect(supabaseStagingWorkflow).toContain("version = '20260628193711'");
    expect(supabaseStagingWorkflow).toContain(
      'supabase migration repair "20260628193711" --db-url "$SUPABASE_STAGING_EFFECTIVE_DB_URL" --status reverted --yes',
    );
  });
});
