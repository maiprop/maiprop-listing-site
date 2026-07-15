import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260714130310_batch_ai_quota_durable_entitlement.sql",
  ),
  "utf8",
);

describe("batched AI quota durable entitlement migration", () => {
  it("resolves Pro once from durable runtime and audience scoped state", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.check_ai_quotas_for_user",
    );
    expect(migration).toContain("public.has_platform_admin(_user_id)");
    expect(migration).toContain("p.force_pro_access");
    expect(migration).toContain("FROM public.billing_subscriptions bs");
    expect(migration).toContain("bs.runtime_mode = v_runtime_mode");
    expect(migration).toContain("bs.livemode = (v_runtime_mode = 'live')");
    expect(migration).toContain("bs.audience = v_audience");
    expect(migration).toContain("bs.status IN ('active', 'trialing', 'past_due')");
    expect(migration).toContain("bs.trial_end > now()");
    expect(migration).not.toContain("subscription_product_id");
  });

  it("preserves current investor access and batches usage and credit counters", () => {
    expect(migration).toContain("FROM public.investor_subscriptions ins");
    expect(migration).toContain(
      "v_audience IN ('investor', 'institutional')",
    );
    expect(migration).toContain("ins.status IN ('active', 'trial')");
    expect(migration).toContain("ins.expires_at IS NULL OR ins.expires_at > now()");
    expect(migration).toContain("usage_by_bucket AS");
    expect(migration).toContain("credits_by_bucket AS");
    expect(migration).toContain(
      "purchases.livemode = (v_runtime_mode = 'live')",
    );
    expect(migration).toContain("jsonb_object_agg");
    expect(migration).not.toContain("public.get_ai_call_monthly_limit(");
  });

  it("keeps the batched RPC service-role-only", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.check_ai_quotas_for_user(uuid, text[])",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.check_ai_quotas_for_user(uuid, text[]) TO service_role",
    );
  });
});
