import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260601152500_rewrite_role_helper_policies.sql"),
  "utf8",
);

const livePostureGate = readFileSync(
  resolve(process.cwd(), "scripts/check-live-security-posture.mjs"),
  "utf8",
);

const futureAdvisorHardeningMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260707140000_harden_supabase_advisor_security.sql"),
  "utf8",
);

describe("public role helper policy rewrite", () => {
  it("rewrites remaining policies to private helpers before revoking public helper execution", () => {
    expect(migration).toContain("private.has_platform_admin(");
    expect(migration).toContain("private.has_role(");
    expect(migration).toContain("private.check_listing_quota(");
    expect(migration).toContain("DROP POLICY IF EXISTS %I ON %I.%I");
    expect(migration).toContain("CREATE POLICY %I ON %I.%I");
  });

  it("makes public role and quota helper RPCs service-role-only", () => {
    for (const signature of [
      "public.authoritative_role()",
      "public.authoritative_role(uuid)",
      "public.check_listing_quota()",
      "public.has_platform_admin(uuid)",
      "public.has_role(uuid,public.app_role)",
      "public.has_role(uuid,public.user_role)",
    ]) {
      expect(migration).toContain(signature);
    }

    expect(migration).toContain("REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION %s TO service_role");
    expect(migration).toContain("public role/quota helper RPC remains browser-executable");
  });

  it("updates live posture expectations and future hardening grants", () => {
    expect(livePostureGate).toContain("role helper must be service-role only");

    const internalGrantBlock = futureAdvisorHardeningMigration.slice(
      futureAdvisorHardeningMigration.indexOf("-- 2. Trigger/cron/internal"),
      futureAdvisorHardeningMigration.indexOf("-- 3. App-facing SECURITY DEFINER RPCs"),
    );
    const appFacingGrantBlock = futureAdvisorHardeningMigration.slice(
      futureAdvisorHardeningMigration.indexOf("-- 3. App-facing SECURITY DEFINER RPCs"),
      futureAdvisorHardeningMigration.indexOf("-- 4. Public buckets"),
    );

    expect(internalGrantBlock).toContain("public.has_platform_admin(uuid)");
    expect(internalGrantBlock).toContain("public.has_role(uuid,public.app_role)");
    expect(internalGrantBlock).toContain("public.check_listing_quota()");
    expect(appFacingGrantBlock).not.toContain("public.has_platform_admin");
    expect(appFacingGrantBlock).not.toContain("public.has_role");
    expect(appFacingGrantBlock).not.toContain("public.check_listing_quota");
  });
});
