import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260707080000_harden_participant_type_entitlement_audience.sql"),
  "utf8",
);

describe("participant_type entitlement hardening migration", () => {
  it("keeps paid audience based on authoritative role before participant_type", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.profile_pricing_audience");
    expect(migration).toContain("WHEN p_role IN ('buyer'::public.user_role, 'seller'::public.user_role) THEN 'participant'");
    expect(migration).toContain("THEN p_role::text");
    expect(migration).toContain("'buyer'::public.user_role, 'developer'");
    expect(migration).toContain("'developer'::public.user_role, 'buyer'");
    expect(migration).toContain("participant_type fallback must not grant high-trust/professional audience without role");
  });

  it("blocks direct self-service participant_type changes outside onboarding RPC", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.profiles_guard_admin_and_role()");
    expect(migration).toContain("NEW.participant_type IS DISTINCT FROM OLD.participant_type");
    expect(migration).toContain("NEW.participant_type IS NULL");
    expect(migration).toContain("NEW.role_switch_in_progress_at IS NOT NULL");
    expect(migration).toContain("participant_type_change_via_direct_update_not_permitted");
    expect(migration).toContain("role_participant_mismatch");
    expect(migration).toContain("maiprop.onboarding_rpc_active");
  });

  it("recreates the profiles guard trigger after replacing the guard function", () => {
    expect(migration).toContain("DROP TRIGGER IF EXISTS profiles_guard_admin_and_role_trg ON public.profiles");
    expect(migration).toContain("CREATE TRIGGER profiles_guard_admin_and_role_trg");
    expect(migration).toContain("EXECUTE FUNCTION public.profiles_guard_admin_and_role()");
  });
});
