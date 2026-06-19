import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const edgeFunction = readFileSync(
  "supabase/functions/project-unit-prices/index.ts",
  "utf8",
);

const migration = readFileSync(
  "supabase/migrations/20260707169000_project_unit_price_edge_rpc.sql",
  "utf8",
);

describe("project unit price Edge boundary", () => {
  it("uses a service-only explicit-user RPC from the Edge Function", () => {
    expect(edgeFunction).toContain('"bulk_update_project_unit_prices_for_user"');
    expect(edgeFunction).toContain("_user_id: user.id");
    expect(edgeFunction).not.toContain('"bulk_update_project_unit_prices"');
  });

  it("keeps the privileged RPC service-role only", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.bulk_update_project_unit_prices_for_user");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.bulk_update_project_unit_prices_for_user(UUID, UUID, NUMERIC)");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.bulk_update_project_unit_prices_for_user(UUID, UUID, NUMERIC)");
    expect(migration).toContain("TO service_role");
    expect(migration).toContain("to_regprocedure('public.bulk_update_project_unit_prices(uuid,numeric)')");
    expect(migration).toContain("bulk_update_project_unit_prices_for_user(uuid,uuid,numeric) must not be browser-callable");
  });
});
