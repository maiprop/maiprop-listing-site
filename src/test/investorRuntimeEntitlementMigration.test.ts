import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrations = resolve(process.cwd(), "supabase/migrations");
const migrationName = readdirSync(migrations).find((name) =>
  /^\d{14}_align_investor_runtime_entitlements\.sql$/.test(name),
);
const migration = migrationName
  ? readFileSync(resolve(migrations, migrationName), "utf8")
  : "";

describe("investor runtime entitlement alignment", () => {
  it("scopes managed investor access to the active billing runtime", () => {
    expect(migrationName).toBeTruthy();
    expect(migration).toContain("private.has_investor_subscription_for_user");
    expect(migration).toContain("subscription.runtime_mode = public.current_billing_runtime_mode()");
    expect(migration).toMatch(
      /subscription\.livemode\s*=\s*\(\s*public\.current_billing_runtime_mode\(\)\s*=\s*'live'\s*\)/,
    );
  });

  it("uses the privileged runtime-scoped helper for server-side Pro charging", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.is_pro");
    expect(migration).toContain("private.has_investor_subscription_for_user(p_user_id)");
    expect(migration).not.toContain("OR public.has_current_investor_subscription(p_user_id)");
  });

  it("keeps browser feed access caller-scoped and authoritative-role based", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.has_current_investor_subscription");
    expect(migration).toContain("p_user_id = (SELECT auth.uid())");
    expect(migration).toMatch(
      /public\.profile_pricing_audience\(\s*profile\.role,\s*profile\.participant_type::text\s*\)/,
    );
    expect(migration).toContain("DROP POLICY IF EXISTS firesale_feed_select");
    expect(migration).not.toContain("profile.participant_type IN ('investor', 'institutional')");
  });
});
