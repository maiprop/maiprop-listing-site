import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = path.resolve(process.cwd(), "supabase/migrations");
const migrationName = fs.readdirSync(migrationsDir).find((name) =>
  /^\d{14}_enforce_pro_only_ai_and_pricing_contract\.sql$/.test(name)
);

describe("Pro-only AI and pricing contract migration", () => {
  it("denies the unpaid AI base allowance to Developer and Investor audiences", () => {
    expect(migrationName).toBeTruthy();
    const migration = fs.readFileSync(path.join(migrationsDir, migrationName!), "utf8");

    expect(migration).toContain("CREATE OR REPLACE FUNCTION private.has_free_ai_access_for_user");
    expect(migration).toContain("NOT IN ('developer', 'investor', 'institutional')");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.get_ai_call_monthly_base_limit");
    expect(migration).toContain("private.has_free_ai_access_for_user(p_user_id)");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.check_ai_quotas_for_user");
    expect(migration).toContain("v_has_free_ai_access");
    expect(migration).toContain("ELSE 0");
  });

  it("keeps arbitrary-user quota helpers behind the service boundary", () => {
    expect(migrationName).toBeTruthy();
    const migration = fs.readFileSync(path.join(migrationsDir, migrationName!), "utf8");

    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("TO service_role");
    expect(migration).toContain("authenticated can execute Pro-only AI helper");
  });
});
