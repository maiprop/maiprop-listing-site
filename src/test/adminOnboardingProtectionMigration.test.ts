import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260518091806_protect_admin_from_self_onboarding.sql"),
  "utf8",
);
const laterOnboardingMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260707030000_restore_public_agent_developer_onboarding.sql"),
  "utf8",
);

describe("admin onboarding protection migration", () => {
  it("blocks public onboarding from demoting existing platform admins", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.complete_onboarding_role_for_user");
    expect(migration).toContain("IF v_old_role = 'admin'::public.user_role THEN");
    expect(migration).toContain("RAISE EXCEPTION 'admin_role_locked'");
    expect(migration).toContain("p_role NOT IN");
  });

  it("keeps the admin demotion guard in the later onboarding replacement migration", () => {
    expect(laterOnboardingMigration).toContain("CREATE OR REPLACE FUNCTION public.complete_onboarding_role_for_user");
    expect(laterOnboardingMigration).toContain("IF v_old_role = 'admin'::public.user_role THEN");
    expect(laterOnboardingMigration).toContain("RAISE EXCEPTION 'admin_role_locked'");
  });

  it("repairs the canonical admin account and verifies report quota", () => {
    expect(migration).toContain("lower(email) = 'admin@maiprop.co'");
    expect(migration).toContain("DISABLE TRIGGER profiles_guard_admin_and_role_trg");
    expect(migration).toContain("role = CASE");
    expect(migration).toContain("WHEN user_id = v_admin_uid THEN 'admin'::public.user_role");
    expect(migration).toContain("is_platform_admin = false");
    expect(migration).toContain("public.has_platform_admin(v_admin_uid)");
    expect(migration).toContain("public.get_report_monthly_limit(v_admin_uid)");
  });

  it("keeps the legacy user_roles admin row aligned for older callers", () => {
    expect(migration).toContain("to_regclass('public.user_roles')");
    expect(migration).toContain("DELETE FROM public.user_roles");
    expect(migration).toContain("INSERT INTO public.user_roles (user_id, role)");
  });
});
