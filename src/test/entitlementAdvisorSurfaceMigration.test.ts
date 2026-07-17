import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationDir = resolve(process.cwd(), "supabase/migrations");
const migrationFile = readdirSync(migrationDir)
  .filter((file) => file.endsWith("_harden_entitlement_advisor_surface.sql"))
  .sort()
  .at(-1);
const migration = migrationFile
  ? readFileSync(resolve(migrationDir, migrationFile), "utf8")
  : "";

describe("entitlement advisor surface hardening", () => {
  it("restores caller-scoped investor wrappers to SECURITY INVOKER", () => {
    expect(migrationFile).toBeTruthy();
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.has_current_investor_subscription(p_user_id uuid)",
    );
    expect(migration).toContain("p_user_id = (SELECT auth.uid())");
    expect(migration.match(/SECURITY INVOKER/g)).toHaveLength(2);
  });

  it("keeps arbitrary Priority-limit evaluation off the browser RPC surface", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.get_priority_ad_monthly_limit(uuid)",
    );
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_priority_ad_monthly_limit(uuid) TO service_role",
    );
  });

  it("asserts that signed-in users cannot execute SECURITY DEFINER entitlement helpers", () => {
    expect(migration).toContain("priority limit helper must not be browser executable");
    expect(migration).toContain("investor subscription wrapper must not be security definer");
  });
});
