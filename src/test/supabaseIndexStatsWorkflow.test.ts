import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const releaseSafetyWorkflow = readFileSync(
  ".github/workflows/reusable-release-safety.yml",
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

const supabaseTypesScript = readFileSync(
  "scripts/check-supabase-types-freshness.cjs",
  "utf8",
);

const liveSecurityScript = readFileSync(
  "scripts/check-live-security-posture.mjs",
  "utf8",
);

describe("Supabase index stats workflow wiring", () => {
  it("passes a direct production DB URL to clean-checkout index-stat captures", () => {
    for (const workflow of [releaseSafetyWorkflow, advisorReportWorkflow]) {
      expect(workflow).toContain(
        "SUPABASE_PRODUCTION_DB_URL: ${{ secrets.SUPABASE_PRODUCTION_DB_URL }}",
      );
      expect(workflow).toContain(
        "SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}",
      );
      expect(workflow).toContain(
        "npm run capture:supabase-index-stats -- --out",
      );
      expect(workflow).toContain(
        "--allow-empty-when-unconfigured",
      );
    }
  });

  it("allows transient advisor unavailability only in release-safety inventory", () => {
    expect(releaseSafetyWorkflow).toContain("--allow-transient-unavailable");
    expect(releaseSafetyWorkflow).toContain(
      "check:supabase-types -- -- --strict --allow-transient-unavailable",
    );
    expect(releaseSafetyWorkflow).toContain(
      "check:live-security-posture -- --allow-transient-unavailable",
    );
    expect(advisorReportWorkflow).not.toContain("--allow-transient-unavailable");
  });

  it("records transient Supabase advisor timeouts without weakening real advisor debt gates", () => {
    expect(advisorScript).toContain("allowTransientUnavailable");
    expect(advisorScript).toContain("function isTransientAdvisorFailure");
    expect(advisorScript).toContain("status === 544");
    expect(advisorScript).toContain("transient_advisor_unavailable");
    expect(advisorScript).toContain("throw new Error");
    expect(advisorScript).toContain("failOnError && failingLintCount > 0");
    expect(advisorScript).toContain("assertAdvisorDebtIsActionable(advisorDebt)");
  });

  it("records transient Supabase type-generation failures without suppressing stale generated types", () => {
    expect(supabaseTypesScript).toContain("allowTransientUnavailable");
    expect(supabaseTypesScript).toContain("isTransientTypesFailure");
    expect(supabaseTypesScript).toContain("error code:\\s*(?:520|522|524|504)");
    expect(supabaseTypesScript).toContain("generated types check was transiently unavailable");
    expect(supabaseTypesScript).toContain("normalize(current) !== normalize(generated)");
    expect(supabaseTypesScript).toContain("src/integrations/supabase/types.ts is stale");
  });

  it("allows transient live-security posture timeouts without suppressing posture failures", () => {
    expect(liveSecurityScript).toContain("allowTransientUnavailable");
    expect(liveSecurityScript).toContain("isTransientManagementFailure");
    expect(liveSecurityScript).toContain("status, text");
    expect(liveSecurityScript).toContain("process.exit(0)");
    expect(liveSecurityScript).toContain("fail(\"posture check failed\", failures)");
  });

  it("lets function-only staging deploys skip DB-backed index stats without weakening migration gates", () => {
    expect(supabaseStagingWorkflow).toMatch(
      /if grep -Eq '\^supabase\/migrations\/' <<< "\$changed_files"; then\s+echo "db_changes=true" >> "\$GITHUB_OUTPUT"[\s\S]*?else\s+echo "db_changes=false" >> "\$GITHUB_OUTPUT"/,
    );
    expect(supabaseStagingWorkflow).toMatch(
      /if grep -Eq '\^\(supabase\/\|deno\\\.\(json\|lock\)\$\)' <<< "\$changed_files"; then\s+echo "deploy=true" >> "\$GITHUB_OUTPUT"/,
    );
    expect(supabaseStagingWorkflow).toContain(
      "if [ \"${{ steps.supabase_changes.outputs.db_changes }}\" = \"true\" ] && [ -z \"$SUPABASE_STAGING_DB_URL\" ]; then",
    );
    expect(supabaseStagingWorkflow).toContain(
      "SUPABASE_STAGING_DB_URL is required when Supabase migrations change",
    );
    expect(supabaseStagingWorkflow).toMatch(
      /- name: Check staging database migration secret\s+if: steps\.supabase_changes\.outputs\.db_changes == 'true' && steps\.supabase_target\.outputs\.isolated_staging == 'true'[\s\S]*SUPABASE_STAGING_DB_URL is required when Supabase migrations change\./,
    );
    expect(supabaseStagingWorkflow).toMatch(
      /- name: Resolve staging database URL\s+if: steps\.supabase_changes\.outputs\.deploy == 'true' && steps\.supabase_target\.outputs\.isolated_staging == 'true'[\s\S]*if \[ -z "\$SUPABASE_STAGING_DB_URL" \]; then[\s\S]*SUPABASE_STAGING_EFFECTIVE_DB_URL=[\s\S]*function-only Supabase prep will use empty index stats\.[\s\S]*exit 0/,
    );
    expect(supabaseStagingWorkflow).toMatch(
      /- name: Capture staging Supabase index stats\s+if: steps\.supabase_changes\.outputs\.deploy == 'true' && steps\.supabase_target\.outputs\.isolated_staging == 'true'\s+run: \|\s+set -euo pipefail\s+extra_args=\(\)\s+if \[ "\$\{\{ steps\.supabase_changes\.outputs\.db_changes \}\}" != "true" \]; then\s+extra_args\+=\(--allow-empty-when-unconfigured\)\s+fi\s+npm run capture:supabase-index-stats -- --out supabase-index-stats\.json "\$\{extra_args\[@\]\}"/,
    );
  });
});
