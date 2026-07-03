import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationDir = resolve(process.cwd(), "supabase/migrations");
const migrationFile = readdirSync(migrationDir)
  .filter((file) => file.endsWith("_harden_current_investor_subscription_rpc.sql"))
  .sort()
  .at(-1);

const migration = migrationFile
  ? readFileSync(resolve(migrationDir, migrationFile), "utf8")
  : "";

describe("current investor subscription advisor hardening", () => {
  it("moves arbitrary user-id subscription checks out of public callable RPCs", () => {
    expect(migrationFile).toBeTruthy();
    expect(migration).toContain("CREATE OR REPLACE FUNCTION private.has_investor_subscription_for_user");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("REVOKE ALL ON FUNCTION private.has_investor_subscription_for_user(uuid) FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION private.has_investor_subscription_for_user(uuid) TO service_role");

    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.has_current_investor_subscription(p_user_id uuid)");
    expect(migration).toContain("p_user_id = (SELECT auth.uid())");
    expect(migration).toContain("SECURITY INVOKER");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.has_current_investor_subscription()");
    expect(migration).toContain("SECURITY INVOKER");
    expect(migration).not.toContain("CREATE OR REPLACE FUNCTION public.has_current_investor_subscription(\n  p_user_id uuid\n)\nRETURNS boolean\nLANGUAGE sql\nSECURITY DEFINER");
  });

  it("rewires privileged server helpers away from the public self-check wrapper", () => {
    expect(migration.indexOf("private.has_investor_subscription_for_user(p_user_id)")).toBeGreaterThan(-1);
    expect(migration.indexOf("private.has_investor_subscription_for_user(v_actor)")).toBeGreaterThan(-1);
    expect(migration).not.toContain("public.has_current_investor_subscription(p_user_id)");
    expect(migration).not.toContain("public.has_current_investor_subscription(v_actor)");
    expect(migration).toContain("authenticated must not execute private investor subscription helper");
    expect(migration).toContain("public investor subscription wrapper must not be security definer");
  });
});
