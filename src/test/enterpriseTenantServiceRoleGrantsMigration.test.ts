import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = resolve(process.cwd(), "supabase/migrations");

const normalizeSql = (value: string) => value.replace(/\s+/g, " ").trim();

const readMigrations = () =>
  normalizeSql(
    readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => readFileSync(resolve(migrationsDir, name), "utf8"))
      .join("\n"),
  );

describe("enterprise tenant service-role grants", () => {
  it("keeps server-side fixture and Edge Function access explicit after browser-role revokes", () => {
    const migrations = readMigrations();

    [
      "organizations",
      "organization_memberships",
      "organization_domains",
      "organization_sso_providers",
      "procurement_evidence",
    ].forEach((tableName) => {
      expect(migrations).toContain(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${tableName} TO service_role`,
      );
    });
  });
});
