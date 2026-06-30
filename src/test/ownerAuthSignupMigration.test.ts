import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260707171000_allow_owner_auth_trigger_signup.sql",
);
const migration = readFileSync(migrationPath, "utf8");
const compactMigration = migration.replace(/\s+/g, " ");

describe("owner auth signup migration", () => {
  it("lets the trusted auth trigger grant owner roles during signup", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.auto_grant_owner_privileges()");
    expect(migration).toContain("maiprop.owner_auth_trigger_active");
    expect(migration).toContain("set_config('maiprop.owner_auth_trigger_active', 'true', true)");
    expect(migration).toContain("LOWER(COALESCE(NEW.email, '')) = 'kr@maiprop.co'");
    expect(migration).toContain("role = 'admin'::public.user_role");
    expect(migration).toContain("participant_type = NULL");
    expect(migration).toContain("LOWER(COALESCE(NEW.email, '')) = 'kostisrenios@gmail.com'");
    expect(migration).toContain("role = 'agent'::public.user_role");
    expect(migration).toContain("participant_type = 'agent'");
  });

  it("keeps the profile guard strict outside that internal auth-trigger path", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.profiles_guard_admin_and_role()");
    expect(migration).toContain("v_via_owner_auth_trigger boolean");
    expect(compactMigration).toContain("IF v_via_owner_auth_trigger THEN RETURN NEW; END IF;");
    expect(migration).toContain("role_change_via_direct_update_not_permitted");
    expect(migration).toContain("participant_type_change_via_direct_update_not_permitted");
    expect(migration).not.toContain("DISABLE TRIGGER");
  });
});