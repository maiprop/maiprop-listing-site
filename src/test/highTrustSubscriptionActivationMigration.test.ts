import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260514190054_activate_high_trust_profile_roles_from_paid_subscriptions.sql",
);

describe("high-trust subscription activation migration", () => {
  const migration = readFileSync(migrationPath, "utf8");

  it("activates profile role only for paid/trial investor subscriptions", () => {
    expect(migration).toContain("sync_profile_role_from_investor_subscription");
    expect(migration).toContain("NEW.status NOT IN ('active', 'trial')");
    expect(migration).toContain("participant_type = v_role::text");
    expect(migration).toContain("role_switch_in_progress_at = NULL");
  });

  it("maps subscription tiers to the intended high-trust roles", () => {
    expect(migration).toContain("WHEN 'institutional' THEN 'institutional'::public.user_role");
    expect(migration).toContain("WHEN 'developer' THEN 'developer'::public.user_role");
    expect(migration).toContain("ELSE 'investor'::public.user_role");
  });

  it("backfills existing active/trial rows so live demo and legacy users stop looping to onboarding", () => {
    expect(migration).toContain("FROM public.investor_subscriptions s");
    expect(migration).toContain("s.status IN ('active', 'trial')");
    expect(migration).toContain("DISABLE TRIGGER profiles_guard_admin_and_role_trg");
    expect(migration).toContain("ENABLE TRIGGER profiles_guard_admin_and_role_trg");
  });
});
