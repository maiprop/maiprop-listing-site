import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("role-switch consent boundary", () => {
  it("keeps provider and destructive mutations out of Settings", () => {
    const settings = read("src/components/dashboard/SettingsSection.tsx");

    expect(settings).toContain("prepareRoleSwitchOperation");
    expect(settings).toContain("toType:");
    expect(settings).not.toContain('"log-role-switch"');
    expect(settings).not.toContain('"begin-role-switch"');
  });

  it("requires a destination-bound audit before destructive role changes", () => {
    const request = read("supabase/functions/log-role-switch/request.ts");
    const migration = read(
      "supabase/migrations/20260812102335_enforce_role_switch_audit_integrity.sql",
    );

    expect(request).not.toContain("z.literal(\"\")");
    expect(migration).toMatch(
      /begin_role_switch_for_user[\s\S]*history\.to_type IS NOT NULL[\s\S]*billing_reconciliation_required = false/,
    );
    expect(migration).toContain("history.to_type = p_participant_type");
  });

  it("keeps Billing reachable while onboarding is required", () => {
    const route = read("src/components/ProtectedRoute.tsx");

    expect(route).toContain('location.pathname === "/dashboard/billing"');
  });
});
