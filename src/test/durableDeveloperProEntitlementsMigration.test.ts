import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260718124557_enforce_durable_developer_pro_entitlements.sql",
  ),
  "utf8",
);

describe("durable Developer Pro entitlement migration", () => {
  it("fails billing and investor entitlements closed during role changes", () => {
    expect(migration).toContain("profile.role_switch_in_progress_at IS NULL");
    expect(migration).toContain(
      "v_audience IS NULL OR v_role_switch_in_progress_at IS NOT NULL",
    );
    expect(migration).toContain(
      "subscription.runtime_mode = public.current_billing_runtime_mode()",
    );
    expect(migration).toContain(
      "subscription.livemode = (public.current_billing_runtime_mode() = 'live')",
    );
  });

  it("keeps project writes limited to admins or current Developer Pro users", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION private.has_developer_listing_access",
    );
    expect(migration).toContain("private.has_platform_admin(_user_id)");
    expect(migration).toContain(
      "profile.role = 'developer'::public.user_role",
    );
    expect(migration).toContain("profile.force_pro_access");
    expect(migration).toContain(
      "private.has_current_billing_subscription_for_user(_user_id)",
    );
    expect(migration).not.toMatch(
      /stripe_price_id|stripe_price_id_monthly|stripe_price_id_annual/,
    );
  });

  it("returns explicit audience evidence to server-side entitlement gates", () => {
    expect(migration).toContain("'audience', v_billing.audience");
    expect(migration).toContain("'audience', v_audience");
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.resolve_subscription_state_for_service(uuid, text)",
    );
  });
});
