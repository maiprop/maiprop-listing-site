import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260716172217_unify_durable_entitlement_contract.sql",
  ),
  "utf8",
);

describe("durable entitlement contract migration", () => {
  it("makes current runtime-scoped billing state authoritative", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION private.has_current_billing_subscription_for_user",
    );
    expect(migration).toContain("subscription.current_period_end IS NOT NULL");
    expect(migration).toContain("subscription.current_period_end > now()");
    expect(migration).toContain("subscription.runtime_mode = public.current_billing_runtime_mode()");
    expect(migration).toContain("subscription.livemode = (public.current_billing_runtime_mode() = 'live')");
  });

  it("routes SQL enforcement and AI quotas through the same predicate", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.has_audience_scoped_pro_entitlement",
    );
    expect(migration).toContain(
      "private.has_current_billing_subscription_for_user(p_user_id)",
    );
    expect(migration).toContain("v_is_pro := public.is_pro(_user_id)");
    expect(migration).not.toContain("current_period_end IS NULL OR");
  });

  it("keeps internal entitlement helpers service-only", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION private.has_current_billing_subscription_for_user(uuid)",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION private.has_current_billing_subscription_for_user(uuid) TO service_role",
    );
  });
});
