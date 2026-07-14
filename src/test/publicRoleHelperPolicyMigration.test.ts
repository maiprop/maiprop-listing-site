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

const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
) as { scripts?: Record<string, string> };

const futureAdvisorHardeningMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260707140000_harden_supabase_advisor_security.sql"),
  "utf8",
);

const internalHelperGrantReassertionMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260602134200_reassert_internal_security_helper_grants.sql",
  ),
  "utf8",
);

const scopedRoleReassertionMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260714170523_reassert_scoped_authoritative_role.sql",
  ),
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
    expect(packageJson.scripts?.["check:live-security-posture"]).toBe(
      "node scripts/check-live-security-posture.mjs",
    );
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

  it("reasserts internal helper grants after historical staging drift", () => {
    for (const signature of [
      "public.authoritative_role()",
      "public.authoritative_role(uuid)",
      "public.check_listing_quota()",
      "public.has_platform_admin(uuid)",
      "public.has_role(uuid,public.app_role)",
      "public.has_role(uuid,public.user_role)",
    ]) {
      expect(internalHelperGrantReassertionMigration).toContain(signature);
    }

    expect(internalHelperGrantReassertionMigration).toContain(
      "REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated",
    );
    expect(internalHelperGrantReassertionMigration).toContain(
      "GRANT EXECUTE ON FUNCTION %s TO service_role",
    );
    expect(internalHelperGrantReassertionMigration).toContain(
      "internal security helper remains browser-executable",
    );
  });

  it("keeps clean restores aligned with the caller-scoped live role lookup", () => {
    expect(scopedRoleReassertionMigration).toContain("_user_id = caller.uid");
    expect(scopedRoleReassertionMigration).toContain("caller.jwt_role = 'service_role'");
    expect(scopedRoleReassertionMigration).toContain(
      "admin_profile.role = 'admin'::public.user_role",
    );
    expect(scopedRoleReassertionMigration).toContain(
      "REVOKE ALL ON FUNCTION public.authoritative_role(uuid) FROM PUBLIC, anon, authenticated",
    );
    expect(scopedRoleReassertionMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.authoritative_role(uuid) TO service_role",
    );
    expect(scopedRoleReassertionMigration).toContain(
      "private.authoritative_role() = 'seller'::public.user_role",
    );
    expect(scopedRoleReassertionMigration).not.toContain(
      "public.authoritative_role((SELECT auth.uid())) = 'seller'::public.user_role",
    );
    expect(scopedRoleReassertionMigration).toContain(
      "public.get_open_house_capacity(uuid)",
    );
    expect(scopedRoleReassertionMigration).toContain(
      "public.submit_agent_data_input(date,text,text,text,numeric,text,text,text,text,text,text,text)",
    );
    expect(scopedRoleReassertionMigration).toContain(
      "REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated",
    );
  });

  it("separates caller-scoped RLS checks from server-only arbitrary-user resolution", () => {
    expect(scopedRoleReassertionMigration).toMatch(
      /REVOKE ALL ON FUNCTION private\.authoritative_role\(uuid\)\s+FROM PUBLIC, anon, authenticated/,
    );
    expect(scopedRoleReassertionMigration).toMatch(
      /GRANT EXECUTE ON FUNCTION private\.authoritative_role\(uuid\)\s+TO service_role/,
    );
    expect(scopedRoleReassertionMigration).toMatch(
      /GRANT EXECUTE ON FUNCTION private\.authoritative_role\(\)\s+TO authenticated, service_role/,
    );
    expect(scopedRoleReassertionMigration).toContain(
      "CREATE OR REPLACE FUNCTION private.get_listing_promotion_plan_allowance",
    );
    expect(scopedRoleReassertionMigration).toContain(
      "v_role := private.authoritative_role(p_user_id)",
    );
    expect(scopedRoleReassertionMigration).toMatch(
      /private\.authoritative_role\(allocation\.created_by\)\s*=\s*'admin'::public\.user_role/,
    );
    expect(scopedRoleReassertionMigration).toMatch(
      /private\.authoritative_role\(audit\.actor_id\)\s*=\s*'admin'::public\.user_role/,
    );
  });
});
