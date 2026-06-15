import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSql = () =>
  readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260614145537_revoke_future_public_default_grants.sql"),
    "utf8",
  );

describe("future public default grants migration", () => {
  it("opts future public objects into explicit Data API grants", () => {
    const sql = migrationSql();

    expect(sql).toContain("ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public");
    expect(sql).toContain("REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated, service_role");
    expect(sql).toContain("REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, authenticated, service_role");
    expect(sql).toContain("REVOKE ALL PRIVILEGES ON FUNCTIONS FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("pg_get_userbyid(d.defaclrole) = 'postgres'");
    expect(sql).toContain("Supabase-managed supabase_admin defaults are not");
    expect(sql).toContain("future public default grants still exist");
  });
});
