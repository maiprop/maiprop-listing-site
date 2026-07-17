import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrations = resolve(process.cwd(), "supabase/migrations");
const migrationName = readdirSync(migrations).find((name) =>
  /^\d{14}_restore_browser_safe_admin_policy_predicates\.sql$/.test(name),
);
const migration = migrationName
  ? readFileSync(resolve(migrations, migrationName), "utf8")
  : "";

describe("browser-safe admin policy predicates", () => {
  it("moves every affected browser policy to the private caller predicate", () => {
    expect(migrationName).toBeTruthy();
    expect(migration.match(/^ALTER POLICY/gm)).toHaveLength(9);
    expect(migration).toContain(
      "private.has_platform_admin((SELECT auth.uid()))",
    );
    expect(migration).toContain("FROM pg_policy AS policy");
    expect(migration).toContain("pg_get_expr(policy.polqual, policy.polrelid)");
    expect(migration).toContain("EXECUTE v_alter_policy");
  });

  it("keeps the arbitrary-user public helper service-only", () => {
    expect(migration).toContain(
      "public.has_platform_admin(uuid) must remain service-only",
    );
    expect(migration).toContain(
      "an RLS policy still calls the service-only public admin predicate",
    );
  });
});
