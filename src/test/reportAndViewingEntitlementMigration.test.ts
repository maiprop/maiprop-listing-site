import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260716221706_enforce_report_and_viewing_entitlements.sql",
  ),
  "utf8",
);

const preauthorizationMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260716223355_preauthorize_property_report_generation.sql",
  ),
  "utf8",
);

describe("report and viewing entitlement enforcement", () => {
  it("enforces property-report plans and add-on credits inside the service RPC", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.charge_property_report_fetch_for_user",
    );
    expect(migration).toContain("private.authoritative_role(p_user_id)");
    expect(migration).toContain("public.is_pro(p_user_id)");
    expect(migration).toContain("public.get_available_addon_credits");
    expect(migration).toContain("public.consume_addon_credit_for_user");
    expect(migration).toContain("report_not_allowed");
    expect(migration).toContain("report_monthly_limit_reached");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.charge_property_report_fetch_for_user[\s\S]*FROM PUBLIC, anon, authenticated/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.charge_property_report_fetch_for_user[\s\S]*TO service_role/,
    );
  });

  it("keeps cached charges idempotent and supports uncached service billing", () => {
    expect(migration).toContain("p_listing_id IS NOT NULL");
    expect(migration).toContain("p_cache_generated_at IS NULL");
    expect(migration).toContain("'alreadyPaid', true");
    expect(migration).toContain("INSERT INTO public.usage_property_reports");
  });

  it("caps buyer and seller requests while leaving seller-hosted viewings unlimited", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.get_viewing_limit");
    expect(migration).toContain(
      "v_role IN ('buyer'::public.user_role, 'seller'::public.user_role)",
    );
    expect(migration).toContain("CASE WHEN public.is_pro(p_user_id) THEN 10 ELSE 1 END");
    expect(migration).toContain("NOT p_is_requester AND v_role = 'seller'::public.user_role");
    expect(migration).toContain("RETURN 999");
  });

  it("preauthorizes report generation before an external provider call", () => {
    expect(preauthorizationMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.authorize_property_report_generation",
    );
    expect(preauthorizationMigration).toContain("private.authoritative_role(p_user_id)");
    expect(preauthorizationMigration).toContain("public.is_pro(p_user_id)");
    expect(preauthorizationMigration).toContain("public.get_available_addon_credits");
    expect(preauthorizationMigration).toContain("report_not_allowed");
    expect(preauthorizationMigration).toContain("report_monthly_limit_reached");
    expect(preauthorizationMigration).toContain("GREATEST(v_base_limit - v_count, 0)");
    expect(preauthorizationMigration).not.toContain("pg_catalog.greatest");
    expect(preauthorizationMigration).toMatch(
      /REVOKE ALL ON FUNCTION public\.authorize_property_report_generation[\s\S]*FROM PUBLIC, anon, authenticated/,
    );
    expect(preauthorizationMigration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.authorize_property_report_generation[\s\S]*TO service_role/,
    );
  });
});
