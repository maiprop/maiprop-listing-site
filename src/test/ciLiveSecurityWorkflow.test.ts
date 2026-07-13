import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ciWorkflow = readFileSync(
  join(process.cwd(), ".github", "workflows", "ci.yml"),
  "utf8",
);

describe("CI live-safe security workflow", () => {
  it("runs Lighthouse for explicitly dispatched Release Please validation", () => {
    expect(ciWorkflow).toContain("github.event_name == 'workflow_dispatch'");
    expect(ciWorkflow).toContain(
      "startsWith(github.ref, 'refs/heads/release-please--')",
    );
  });

  it("uses isolated staging only when a matching staging service-role key exists", () => {
    expect(ciWorkflow).toContain("E2E_SECURITY_USE_ISOLATED_STAGING");
    expect(ciWorkflow).toContain("secrets.STAGING_SUPABASE_SERVICE_ROLE_KEY != ''");
    expect(ciWorkflow).toContain(
      "SUPABASE_SERVICE_ROLE_KEY: ${{ needs['deploy-supabase-staging'].outputs.isolated_staging == 'true' && secrets.STAGING_SUPABASE_SERVICE_ROLE_KEY != '' && secrets.STAGING_SUPABASE_SERVICE_ROLE_KEY || secrets.SUPABASE_SERVICE_ROLE_KEY }}",
    );
    expect(ciWorkflow).toContain(
      "E2E_ALLOW_DESTRUCTIVE_LIVE_TESTS: ${{ needs['deploy-supabase-staging'].outputs.isolated_staging == 'true' && secrets.STAGING_SUPABASE_SERVICE_ROLE_KEY != '' && 'true' || 'false' }}",
    );
    expect(ciWorkflow).toContain(
      "E2E_ALLOWED_DESTRUCTIVE_PROJECT_REFS: ${{ needs['deploy-supabase-staging'].outputs.isolated_staging == 'true' && secrets.STAGING_SUPABASE_SERVICE_ROLE_KEY != '' && secrets.STAGING_SUPABASE_PROJECT_ID || '' }}",
    );
  });

  it("validates the selected service-role key before destructive live security tests run", () => {
    const validationStepIndex = ciWorkflow.indexOf(
      "Validate selected Supabase service role key",
    );
    const playwrightStepIndex = ciWorkflow.indexOf(
      "Run live-safe RLS + conditional onboarding + GDPR security tests",
    );

    expect(validationStepIndex).toBeGreaterThan(0);
    expect(playwrightStepIndex).toBeGreaterThan(validationStepIndex);
    expect(ciWorkflow).toContain(
      "steps.pr_supabase_changes.outputs.has_supabase_changes != 'true' && env.E2E_ALLOW_DESTRUCTIVE_LIVE_TESTS == 'true'",
    );
    expect(ciWorkflow).toContain(
      "Skipping Auth Admin service-role validation because destructive live security tests are disabled",
    );
    expect(ciWorkflow).toContain("/auth/v1/admin/users?page=1&per_page=1");
    expect(ciWorkflow).toContain(
      "Selected SUPABASE_SERVICE_ROLE_KEY is not accepted by",
    );
  });

  it("runs onboarding guard tests only against isolated staging", () => {
    expect(ciWorkflow).toContain(
      'required+=("ONBOARDING_TEST_EMAIL" "ONBOARDING_TEST_PASSWORD")',
    );
    expect(ciWorkflow).toContain(
      'specs=(e2e/rls-security.spec.ts e2e/gdpr-delete-account.spec.ts)',
    );
    expect(ciWorkflow).toContain(
      'specs+=(e2e/onboarding-role-selection.spec.ts)',
    );
    expect(ciWorkflow).toContain(
      "Skipping onboarding role-selection tests because live-safe security is using production fallback runtime",
    );
  });

  it("does not hard-fail production-fallback security tests when the live data plane is unavailable", () => {
    expect(ciWorkflow).toContain(
      "Probe production Supabase data plane before fallback security tests",
    );
    expect(ciWorkflow).toContain(
      "steps.supabase_data_plane_probe.outputs.ready == 'true'",
    );
    expect(ciWorkflow).toContain(
      "Skipped production-fallback live-safe security tests because production Supabase fallback preflight did not pass",
    );
    expect(ciWorkflow).toContain(
      "Configure isolated staging to make these tests a hard PR gate independent of production availability",
    );
  });

  it("preflights production fallback RLS test credentials before running RLS browser tests", () => {
    const authProbeIndex = ciWorkflow.indexOf(
      "Probe production fallback RLS test credentials",
    );
    const playwrightStepIndex = ciWorkflow.indexOf(
      "Run live-safe RLS + conditional onboarding + GDPR security tests",
    );

    expect(authProbeIndex).toBeGreaterThan(0);
    expect(playwrightStepIndex).toBeGreaterThan(authProbeIndex);
    expect(ciWorkflow).toContain("id: production_rls_auth_probe");
    expect(ciWorkflow).toContain("/auth/v1/token?grant_type=password");
    expect(ciWorkflow).toContain(
      "steps.production_rls_auth_probe.outputs.ready == 'true'",
    );
    expect(ciWorkflow).toContain(
      "Refresh RLS_USER_A_EMAIL/RLS_USER_B_EMAIL/RLS_USER_PASSWORD or configure isolated staging",
    );
  });
});
