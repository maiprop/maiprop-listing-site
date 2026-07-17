import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrations = resolve(process.cwd(), "supabase/migrations");
const migrationName = readdirSync(migrations).find((name) =>
  /^\d{14}_unify_plan_limit_enforcement\.sql$/.test(name)
);
const migration = migrationName
  ? readFileSync(resolve(migrations, migrationName), "utf8")
  : "";

describe("canonical plan-limit enforcement migration", () => {
  it("removes legacy triggers that double-enforce reports and priority ads", () => {
    expect(migrationName).toBeTruthy();
    expect(migration).toContain(
      "DROP TRIGGER IF EXISTS trg_check_report_limit ON public.usage_property_reports",
    );
    expect(migration).toContain(
      "DROP TRIGGER IF EXISTS trg_check_priority_ad_limit ON public.usage_priority_ads",
    );
    expect(migration).toContain(
      "DROP TRIGGER IF EXISTS trg_check_valuation_limit ON public.usage_ai_valuations",
    );
  });

  it("matches the Agent and Developer promotion contract", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.get_priority_ad_monthly_limit",
    );
    expect(migration).toMatch(/WHEN 'agent' THEN 10/);
    expect(migration).toMatch(/WHEN 'developer' THEN 1/);
    expect(migration).toMatch(/WHEN 'seller' THEN 0/);
    expect(migration).toContain("RETURN 999");
  });

  it("never exposes arbitrary-user promotion allowances during a partial rollout", () => {
    const priorityGrant = migration.match(
      /GRANT EXECUTE ON FUNCTION public\.get_priority_ad_monthly_limit\(uuid\)[\s\S]*?;/,
    )?.[0];

    expect(priorityGrant).toContain("TO service_role");
    expect(priorityGrant).not.toContain("authenticated");
  });

  it("allows durable role-scoped Pro state without a stale profile product mirror", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION private.get_listing_promotion_plan_allowance",
    );
    expect(migration).toContain("public.is_pro(p_user_id)");
    expect(migration).not.toContain("profile.subscription_product_id");
  });
});
