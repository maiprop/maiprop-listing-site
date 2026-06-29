import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const serviceRpcMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260602034000_service_role_switch_audit_rpc.sql"),
  "utf8",
);

const edgeFunction = readFileSync(
  resolve(process.cwd(), "supabase/functions/log-role-switch/index.ts"),
  "utf8",
);

const futureAdvisorHardeningMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260707140000_harden_supabase_advisor_security.sql"),
  "utf8",
);

describe("role-switch audit RPC grant hardening", () => {
  it("adds a service-role RPC that takes the verified caller id explicitly", () => {
    expect(serviceRpcMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.record_role_switch_audit_for_user",
    );
    expect(serviceRpcMigration).toContain("_user_id uuid");
    expect(serviceRpcMigration).toContain(
      "REVOKE ALL ON FUNCTION public.record_role_switch_audit_for_user",
    );
    expect(serviceRpcMigration).toContain("FROM PUBLIC, anon, authenticated");
    expect(serviceRpcMigration).toContain("TO service_role");
  });

  it("routes the Edge Function through service role after JWT verification", () => {
    expect(edgeFunction).toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
    expect(edgeFunction).toContain("verifyBearerToken(req, supabaseAdmin)");
    expect(edgeFunction).toContain("supabaseAdmin.rpc(");
    expect(edgeFunction).toContain('"record_role_switch_audit_for_user"');
    expect(edgeFunction).toContain("_user_id: user.id");
    expect(edgeFunction).not.toContain('supabase.rpc("record_role_switch_audit"');
  });

  it("cancels Stripe subscriptions using app-owned customer metadata before durable billing fallback", () => {
    const metadataSearchIndex = edgeFunction.indexOf("stripe.customers.search");
    const durableFallbackIndex = edgeFunction.indexOf("billing_customers");
    const subscriptionListIndex = edgeFunction.indexOf("stripe.subscriptions.list");

    expect(edgeFunction).toContain("findOwnedStripeCustomerForRoleSwitch");
    expect(edgeFunction).toContain("metadata['user_id']");
    expect(metadataSearchIndex).toBeGreaterThanOrEqual(0);
    expect(durableFallbackIndex).toBeGreaterThan(metadataSearchIndex);
    expect(subscriptionListIndex).toBeGreaterThan(durableFallbackIndex);
    expect(edgeFunction).not.toContain("stripe.customers.list");
    expect(edgeFunction).toContain("customer: customer.id");
  });

  it("removes browser execution from the legacy caller-context RPC", () => {
    expect(serviceRpcMigration).toContain(
      "to_regprocedure('public.record_role_switch_audit(text,text,text,boolean,boolean)')",
    );
    expect(serviceRpcMigration).toContain(
      "REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated",
    );
    expect(serviceRpcMigration).toContain(
      "legacy role-switch audit RPC must not be browser-executable",
    );
  });

  it("keeps the future advisor-hardening migration aligned for fresh database builds", () => {
    expect(futureAdvisorHardeningMigration).toContain(
      "public.record_role_switch_audit_for_user(uuid,text,text,text,boolean,boolean)",
    );
    expect(futureAdvisorHardeningMigration).toContain(
      "public.record_role_switch_audit(text,text,text,boolean,boolean)",
    );
    const appFacingGrantBlock = futureAdvisorHardeningMigration.slice(
      futureAdvisorHardeningMigration.indexOf("-- 3. App-facing SECURITY DEFINER RPCs"),
      futureAdvisorHardeningMigration.indexOf("-- 4. Public buckets"),
    );
    expect(appFacingGrantBlock).not.toContain("public.record_role_switch_audit");
  });
});
