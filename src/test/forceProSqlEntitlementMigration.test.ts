import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260518193100_include_force_pro_in_sql_is_pro.sql"),
  "utf8",
);

describe("force Pro SQL entitlement migration", () => {
  it("keeps SQL is_pro aligned with the app-level force_pro_access override", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.is_pro(p_user_id uuid)");
    expect(migration).toContain("p.force_pro_access");
    expect(migration).toContain("public.has_audience_scoped_pro_entitlement(p_user_id)");
    expect(migration).toContain("public.has_platform_admin(p_user_id)");
  });

  it("keeps direct is_pro execution restricted to service role", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.is_pro(uuid) FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.is_pro(uuid) TO service_role");
  });
});
