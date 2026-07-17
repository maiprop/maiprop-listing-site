import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationDir = resolve(process.cwd(), "supabase/migrations");
const migrationFile = readdirSync(migrationDir)
  .filter((file) => file.endsWith("_restore_caller_scoped_investor_rpc.sql"))
  .sort()
  .at(-1);
const migration = migrationFile
  ? readFileSync(resolve(migrationDir, migrationFile), "utf8")
  : "";

describe("caller-scoped investor entitlement runtime", () => {
  it("uses a private no-argument actor helper for runtime-aware checks", () => {
    expect(migrationFile).toBeTruthy();
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION private.has_current_investor_subscription_for_actor()",
    );
    expect(migration).toContain("private.has_investor_subscription_for_user((SELECT auth.uid()))");
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION private.has_current_investor_subscription_for_actor() TO authenticated, service_role",
    );
  });

  it("keeps public wrappers invoker-scoped and cross-user safe", () => {
    expect(migration.match(/\nSECURITY INVOKER\n/g)).toHaveLength(2);
    expect(migration).toContain("p_user_id = (SELECT auth.uid())");
    expect(migration).toContain("private.has_current_investor_subscription_for_actor()");
  });

  it("asserts private arbitrary-user access remains unavailable to browsers", () => {
    expect(migration).toContain("browser must not execute arbitrary-user investor helper");
    expect(migration).toContain("public investor wrappers must remain security invoker");
  });
});
