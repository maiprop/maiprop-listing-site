import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ciWorkflow = readFileSync(
  join(process.cwd(), ".github", "workflows", "ci.yml"),
  "utf8",
);

describe("CI live-safe security workflow", () => {
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

  it("validates the selected service-role key before live-safe Playwright tests run", () => {
    const validationStepIndex = ciWorkflow.indexOf(
      "Validate selected Supabase service role key",
    );
    const playwrightStepIndex = ciWorkflow.indexOf(
      "Run live-safe RLS + conditional onboarding + GDPR security tests",
    );

    expect(validationStepIndex).toBeGreaterThan(0);
    expect(playwrightStepIndex).toBeGreaterThan(validationStepIndex);
    expect(ciWorkflow).toContain("/auth/v1/admin/users?page=1&per_page=1");
    expect(ciWorkflow).toContain(
      "env.E2E_SECURITY_USE_ISOLATED_STAGING == 'true'",
    );
    expect(ciWorkflow).toContain("const maxAttempts = 3");
    expect(ciWorkflow).toContain("AbortController");
    expect(ciWorkflow).toContain("Supabase service-role validation");
    expect(ciWorkflow).toContain(
      "Selected SUPABASE_SERVICE_ROLE_KEY is not accepted by",
    );
    expect(ciWorkflow).toContain("SupabaseServiceRoleValidationError");
  });

  it("runs onboarding guard tests only against isolated staging", () => {
    expect(ciWorkflow).toContain("ONBOARDING_TEST_EMAIL");
    expect(ciWorkflow).toContain("ONBOARDING_TEST_PASSWORD");
    expect(ciWorkflow).toContain(
      'specs=(e2e/rls-security.spec.ts e2e/gdpr-delete-account.spec.ts)',
    );
    expect(ciWorkflow).toContain(
      'specs+=(e2e/onboarding-role-selection.spec.ts)',
    );
    expect(ciWorkflow).toContain(
      "Skipping live-safe security tests because isolated staging is not fully configured",
    );
  });
});
