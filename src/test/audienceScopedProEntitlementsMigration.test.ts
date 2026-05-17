import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260707070000_audience_scoped_pro_entitlements.sql"),
  "utf8",
);

const PRO_PLAN_KEYS = ["pro", "agent_basic", "developer_pro", "professional_basic"] as const;
const PRO_SUBSCRIPTION_MODULES = [
  "user_subscription",
  "agent_subscription",
  "developer_subscription",
  "professional_subscription",
] as const;

const sqlArrayContains = (values: readonly string[]) =>
  `ARRAY[${values.map((value) => `'${value}'`).join(", ")}]`;

describe("audience-scoped Pro entitlement migration", () => {
  it("binds SQL Pro status to active Pro subscription pricing configs for the profile audience", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.profile_pricing_audience");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.has_audience_scoped_pro_entitlement");
    expect(migration).toContain("pc.audience = public.profile_pricing_audience");
    expect(migration).toContain(`pc.key = ANY (${sqlArrayContains(PRO_PLAN_KEYS)})`);
    expect(migration).toContain(`pc.module = ANY (${sqlArrayContains(PRO_SUBSCRIPTION_MODULES)})`);
    expect(migration).toContain("pc.metadata->>'stripe_product_id' = p.subscription_product_id");
    expect(migration).not.toContain("JOIN public.pro_product_ids pp");
  });

  it("does not let same-audience add-on, ad-hoc, valuation, data, or non-Pro configs satisfy Pro entitlement", () => {
    const satisfiesSqlProConfigPredicate = (row: { key: string; module: string }) =>
      PRO_PLAN_KEYS.includes(row.key as (typeof PRO_PLAN_KEYS)[number]) &&
      PRO_SUBSCRIPTION_MODULES.includes(row.module as (typeof PRO_SUBSCRIPTION_MODULES)[number]);

    for (const row of [
      { key: "extra_listing", module: "adhoc_charges" },
      { key: "featured_listing", module: "adhoc_charges" },
      { key: "agent_extra_seat", module: "adhoc_charges" },
      { key: "valuation_single", module: "valuation_reports" },
      { key: "valuation_bundle", module: "valuation_reports" },
      { key: "market_intelligence", module: "os_data_products" },
      { key: "avm_api", module: "os_data_products" },
      { key: "participant_free", module: "user_subscription" },
      { key: "agent_free", module: "agent_subscription" },
      { key: "professional_premium", module: "professional_subscription" },
      { key: "agency_growth", module: "agent_subscription" },
    ]) {
      expect(satisfiesSqlProConfigPredicate(row), `${row.key}/${row.module}`).toBe(false);
    }

    for (const row of [
      { key: "pro", module: "user_subscription" },
      { key: "agent_basic", module: "agent_subscription" },
      { key: "developer_pro", module: "developer_subscription" },
      { key: "professional_basic", module: "professional_subscription" },
    ]) {
      expect(satisfiesSqlProConfigPredicate(row), `${row.key}/${row.module}`).toBe(true);
    }
  });

  it("rebuilds quota helpers on the canonical audience-scoped Pro helper", () => {
    for (const signature of [
      "CREATE OR REPLACE FUNCTION public.is_pro(p_user_id uuid)",
      "CREATE OR REPLACE FUNCTION public.check_listing_quota()",
      "CREATE OR REPLACE FUNCTION public.get_listing_limit(p_user_id UUID)",
      "CREATE OR REPLACE FUNCTION public.get_saved_search_limit(p_user_id UUID)",
      "CREATE OR REPLACE FUNCTION public.get_search_alert_limit(p_user_id UUID)",
      "CREATE OR REPLACE FUNCTION public.get_auction_alert_limit(p_user_id UUID)",
      "CREATE OR REPLACE FUNCTION public.get_viewing_limit(",
    ]) {
      expect(migration).toContain(signature);
    }

    expect(migration).toContain("public.has_audience_scoped_pro_entitlement(p_user_id)");
    expect(migration).toContain("public.has_audience_scoped_pro_entitlement(p.user_id)");
    expect(migration).toContain("public.is_pro(p_user_id)");
  });

  it("keeps direct helper execution restricted while allowing dependent quotas", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.has_audience_scoped_pro_entitlement(uuid) FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.has_audience_scoped_pro_entitlement(uuid) TO service_role",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_viewing_limit(UUID, BOOLEAN) TO authenticated, service_role",
    );
  });
});
