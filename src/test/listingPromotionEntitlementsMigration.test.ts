import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260714112834_listing_promotion_entitlements.sql",
  ),
  "utf8",
);

const runtimeMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260714114313_private_billing_runtime_config.sql",
  ),
  "utf8",
);

const rpcBoundaryMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260714120200_promotion_rpc_invoker_boundaries.sql",
  ),
  "utf8",
);

const correctionMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260714122405_correct_promotion_entitlement_runtime.sql",
  ),
  "utf8",
);

const integrityMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260714144321_enforce_promotion_and_ownership_integrity.sql",
  ),
  "utf8",
);

const refundMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260714153937_reconcile_addon_refund_events.sql",
  ),
  "utf8",
);

const lockOrderMigrationName = readdirSync(
  resolve(process.cwd(), "supabase/migrations"),
).find((name) => /^\d{14}_reassert_promotion_lock_order\.sql$/.test(name));
const lockOrderMigration = lockOrderMigrationName
  ? readFileSync(
    resolve(process.cwd(), "supabase/migrations", lockOrderMigrationName),
    "utf8",
  )
  : "";

const migrationDirectory = resolve(process.cwd(), "supabase/migrations");
const remediationMigrationName = readdirSync(migrationDirectory).find((name) =>
  /^\d{14}_remediate_promotion_entitlements\.sql$/.test(name)
);
const remediationMigration = remediationMigrationName
  ? readFileSync(resolve(migrationDirectory, remediationMigrationName), "utf8")
  : "";

const campaignTruthMigrationName = readdirSync(migrationDirectory).find((name) =>
  /^\d{14}_report_promotion_campaign_truth_and_block_open_houses\.sql$/.test(name)
);
const campaignTruthMigration = campaignTruthMigrationName
  ? readFileSync(resolve(migrationDirectory, campaignTruthMigrationName), "utf8")
  : "";
const openHouseTransitionGuardMigrationName = readdirSync(migrationDirectory).find((name) =>
  /^\d{14}_guard_open_house_listing_type_transition\.sql$/.test(name)
);
const openHouseTransitionGuardMigration = openHouseTransitionGuardMigrationName
  ? readFileSync(resolve(migrationDirectory, openHouseTransitionGuardMigrationName), "utf8")
  : "";
const secureCampaignRpcMigrationName = readdirSync(migrationDirectory).find((name) =>
  /^\d{14}_secure_admin_promotion_campaign_rpc\.sql$/.test(name)
);
const secureCampaignRpcMigration = secureCampaignRpcMigrationName
  ? readFileSync(resolve(migrationDirectory, secureCampaignRpcMigrationName), "utf8")
  : "";
const campaignExpiryMigrationName = readdirSync(migrationDirectory).find((name) =>
  /^\d{14}_preserve_listing_promotion_campaign_history\.sql$/.test(name)
);
const campaignExpiryMigration = campaignExpiryMigrationName
  ? readFileSync(resolve(migrationDirectory, campaignExpiryMigrationName), "utf8")
  : "";

function sqlSection(sql: string, start: string, end: string): string {
  const startIndex = sql.indexOf(start);
  const endIndex = sql.indexOf(end, startIndex + start.length);
  expect(startIndex, `missing SQL section start: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endIndex, `missing SQL section end: ${end}`).toBeGreaterThan(startIndex);
  return sql.slice(startIndex, endIndex);
}

describe("listing promotion entitlement migration", () => {
  it("reports allocation-window campaign truth and blocks inert Open House promotions", () => {
    expect(campaignTruthMigrationName).toBeDefined();
    expect(campaignTruthMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.get_admin_listing_promotion_campaigns",
    );
    expect(campaignTruthMigration).toContain("public.has_platform_admin((SELECT auth.uid()))");
    expect(campaignTruthMigration).toContain("listing_view_events");
    expect(campaignTruthMigration).toContain("public.favorites");
    expect(campaignTruthMigration).toContain("public.conversations");
    expect(campaignTruthMigration).toContain("allocation.starts_at");
    expect(campaignTruthMigration).toContain("allocation.ends_at");
    expect(campaignTruthMigration).toContain("open_house_promotion_not_supported");
    expect(campaignTruthMigration).toContain("source_type = 'admin'");
    expect(campaignTruthMigration).toContain(
      "revoke_reason = 'open_house_promotion_not_supported'",
    );
    expect(campaignTruthMigration).toContain("listing_type::text = 'open_house'");
    expect(openHouseTransitionGuardMigrationName).toBeDefined();
    expect(openHouseTransitionGuardMigration).toContain(
      "CREATE OR REPLACE FUNCTION private.guard_open_house_listing_type_transition",
    );
    expect(openHouseTransitionGuardMigration).toContain(
      "BEFORE UPDATE OF listing_type ON public.listings",
    );
    expect(openHouseTransitionGuardMigration).toContain(
      "open_house_active_promotion_must_be_revoked_first",
    );
  });

  it("keeps the browser campaign RPC invoker-safe and privileged aggregation private", () => {
    expect(secureCampaignRpcMigrationName).toBeDefined();
    expect(secureCampaignRpcMigration).toContain(
      "CREATE OR REPLACE FUNCTION private.get_admin_listing_promotion_campaigns_internal",
    );
    expect(secureCampaignRpcMigration).toContain("SECURITY DEFINER");
    expect(secureCampaignRpcMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.get_admin_listing_promotion_campaigns",
    );
    expect(secureCampaignRpcMigration).toContain("SECURITY INVOKER");
    expect(secureCampaignRpcMigration).toContain(
      "REVOKE ALL ON FUNCTION private.get_admin_listing_promotion_campaigns_internal()",
    );
    expect(secureCampaignRpcMigration).toContain(
      "GRANT EXECUTE ON FUNCTION private.get_admin_listing_promotion_campaigns_internal() TO authenticated, service_role",
    );
    expect(
      secureCampaignRpcMigration.match(/private\.has_platform_admin\(\(SELECT auth\.uid\(\)\)\)/g),
    ).toHaveLength(2);
    expect(secureCampaignRpcMigration.match(/platform_admin_required/g)).toHaveLength(2);
  });

  it("updates promotion expiry without resetting campaign history or attribution", () => {
    expect(campaignExpiryMigrationName).toBeDefined();
    expect(campaignExpiryMigration).toContain(
      "CREATE OR REPLACE FUNCTION private.admin_update_listing_promotion_expiry",
    );
    expect(campaignExpiryMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.admin_update_listing_promotion_expiry",
    );
    expect(campaignExpiryMigration).toContain("SET ends_at = p_ends_at");
    expect(campaignExpiryMigration).toContain("status = 'active'");
    expect(campaignExpiryMigration).not.toContain("SET starts_at =");
    expect(campaignExpiryMigration).not.toContain("source_type =");
    expect(campaignExpiryMigration).not.toContain("billing_subscription_id =");
    expect(campaignExpiryMigration).not.toContain("addon_purchase_id =");
    expect(campaignExpiryMigration).toContain("TO service_role");
  });

  it("uses a private fail-closed Stripe runtime configuration", () => {
    expect(runtimeMigration).toContain(
      "CREATE TABLE IF NOT EXISTS private.billing_runtime_config",
    );
    expect(runtimeMigration).toContain("VALUES (true, 'live')");
    expect(runtimeMigration).toContain(
      "REVOKE ALL ON private.billing_runtime_config FROM PUBLIC, anon, authenticated",
    );
    expect(runtimeMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.current_billing_runtime_mode()",
    );
  });

  it("adds a server-owned allocation ledger with owner-scoped reads", () => {
    expect(migration).toContain(
      "CREATE TABLE IF NOT EXISTS public.listing_promotion_allocations",
    );
    expect(migration).toContain(
      "ALTER TABLE public.listing_promotion_allocations ENABLE ROW LEVEL SECURITY",
    );
    expect(migration).toContain(
      "REVOKE INSERT, UPDATE, DELETE ON public.listing_promotion_allocations FROM authenticated",
    );
    expect(migration).toContain("listing_promotion_allocations_select_own");
    expect(migration).toContain("owner_id = (SELECT auth.uid())");
  });

  it("enforces the agreed paid-plan allowances without granting trial credits", () => {
    expect(migration).toContain("WHEN 'seller' THEN 1");
    expect(migration).toContain("WHEN 'agent' THEN 10");
    expect(migration).toContain("WHEN 'developer' THEN 1");
    expect(migration).toContain("bs.status = 'active'");
    expect(migration).toContain(
      "bs.runtime_mode = public.current_billing_runtime_mode()",
    );
    expect(migration).not.toContain("bs.status IN ('active', 'trialing')");
  });

  it("activates Spotlight, Priority, and bundle promotions transactionally", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.activate_listing_promotion",
    );
    expect(migration).toContain("p_promotion_type NOT IN ('spotlight', 'priority', 'bundle')");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("featured_priority_bundle");
    expect(migration).toContain("featured_listing");
    expect(migration).toContain("priority_placement");
    expect(migration).toContain(
      "runtime_mode = public.current_billing_runtime_mode()",
    );
    expect(migration).toContain("priority_until");
    expect(migration).toContain("interval '30 days'");
  });

  it("blocks direct browser promotion changes and expires both projections", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION private.guard_listing_promotion_projection",
    );
    expect(migration).toContain("listing_promotion_fields_are_server_managed");
    expect(migration).toContain("BEFORE INSERT ON public.listings");
    expect(migration).toContain("BEFORE UPDATE OF is_featured");
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.expire_listing_promotions",
    );
    expect(migration).toContain("SET status = 'expired'");
    expect(migration).toContain("is_featured = v_spotlight_until IS NOT NULL");
    expect(migration).toContain("priority_placement = CASE WHEN v_priority_until IS NULL THEN 0 ELSE 1 END");
  });

  it("keeps activation callable only by signed-in users and service operations", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.activate_listing_promotion(uuid, text, text) FROM PUBLIC, anon",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.activate_listing_promotion(uuid, text, text) TO authenticated, service_role",
    );
  });

  it("revokes allocations using the existing Stripe refund vocabulary", () => {
    expect(migration).toContain("NEW.refund_status = 'refunded'");
    expect(migration).toContain(
      "NEW.credits_refunded >= NEW.credits_granted",
    );
    expect(migration).not.toContain("NEW.refund_status = 'full'");
  });

  it("quarantines legacy projections and restores only verified paid or admin evidence", () => {
    expect(migration).toContain(
      "Legacy paid columns are untrusted projections",
    );
    expect(migration).toContain(
      "private.legacy_listing_promotion_quarantine",
    );
    expect(remediationMigration).not.toContain(
      "public.has_platform_admin(v_candidate.owner_id)",
    );
    expect(remediationMigration).toContain("allocation.source_type = 'plan'");
    expect(remediationMigration).toContain("allocation.source_type = 'addon'");
    expect(remediationMigration).toContain("allocation.source_type = 'admin'");
    expect(remediationMigration).toContain("resolution = 'cleared'");
    expect(remediationMigration).toContain(
      "subscription.stripe_product_id = profile.subscription_product_id",
    );
  });

  it("keeps public promotion RPCs invoker-safe while privileged writes stay private", () => {
    for (const signature of [
      "activate_listing_promotion(uuid,text,text)",
      "deactivate_listing_promotion(uuid,text)",
      "get_listing_promotion_balance()",
    ]) {
      expect(rpcBoundaryMigration).toContain(
        `to_regprocedure('private.${signature}') IS NULL`,
      );
      expect(rpcBoundaryMigration).toContain(
        `to_regprocedure('public.${signature}') IS NOT NULL`,
      );
    }
    expect(rpcBoundaryMigration).toMatch(
      /ALTER FUNCTION public\.activate_listing_promotion\(uuid, text, text\)\s+SET SCHEMA private/,
    );
    expect(rpcBoundaryMigration).toMatch(
      /ALTER FUNCTION public\.deactivate_listing_promotion\(uuid, text\)\s+SET SCHEMA private/,
    );
    expect(rpcBoundaryMigration).toMatch(
      /ALTER FUNCTION public\.get_listing_promotion_balance\(\)\s+SET SCHEMA private/,
    );
    expect(rpcBoundaryMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.activate_listing_promotion",
    );
    expect(rpcBoundaryMigration).toContain("SECURITY INVOKER");
    expect(rpcBoundaryMigration).toMatch(
      /REVOKE ALL ON FUNCTION private\.activate_listing_promotion\(uuid, text, text\)\s+FROM PUBLIC, anon, authenticated/,
    );
    expect(rpcBoundaryMigration).toMatch(
      /GRANT EXECUTE ON FUNCTION private\.activate_listing_promotion\(uuid, text, text\)\s+TO authenticated, service_role/,
    );
  });

  it("serializes allowance and request-key decisions across different listings", () => {
    expect(correctionMigration).toContain("listing_promotion_plan:");
    expect(correctionMigration).toContain("listing_promotion_request:");
    expect(correctionMigration).toContain("v_cycle_start::text");
    expect(correctionMigration).toContain("pg_advisory_xact_lock");
  });

  it("uses one listing-first lock order for activation, expiry, and refund reconciliation", () => {
    const activation = sqlSection(
      correctionMigration,
      "CREATE OR REPLACE FUNCTION private.activate_listing_promotion",
      "CREATE OR REPLACE FUNCTION private.revoke_refunded_listing_promotions",
    );
    const refund = sqlSection(
      refundMigration,
      "CREATE OR REPLACE FUNCTION public.reconcile_addon_refund_event",
      "REVOKE ALL ON FUNCTION public.reconcile_addon_refund_event",
    );
    const expiry = sqlSection(
      integrityMigration,
      "CREATE OR REPLACE FUNCTION public.expire_listing_promotions",
      "REVOKE ALL ON FUNCTION public.expire_listing_promotions",
    );

    expect(activation.indexOf("'listing_promotion:'")).toBeLessThan(
      activation.indexOf("FOR UPDATE OF listing"),
    );
    expect(refund.indexOf("'listing_promotion:'")).toBeLessThan(
      refund.indexOf("FOR UPDATE;"),
    );
    expect(expiry.indexOf("'listing_promotion:'")).toBeLessThan(
      expiry.indexOf("UPDATE public.listing_promotion_allocations"),
    );
  });

  it("reasserts the corrected lock order in a forward-only deployment migration", () => {
    expect(lockOrderMigrationName).toMatch(
      /^20260714\d{6}_reassert_promotion_lock_order\.sql$/,
    );
    expect(lockOrderMigration).toContain(
      "CREATE OR REPLACE FUNCTION private.activate_listing_promotion",
    );
    expect(lockOrderMigration).toContain(
      "CREATE OR REPLACE FUNCTION private.reconcile_plan_promotion_allocations",
    );
    expect(lockOrderMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.expire_listing_promotions",
    );
    expect(lockOrderMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.reconcile_addon_refund_event",
    );

    const activation = sqlSection(
      lockOrderMigration,
      "CREATE OR REPLACE FUNCTION private.activate_listing_promotion",
      "CREATE OR REPLACE FUNCTION private.reconcile_plan_promotion_allocations",
    );
    const refund = sqlSection(
      lockOrderMigration,
      "CREATE OR REPLACE FUNCTION public.reconcile_addon_refund_event",
      "REVOKE ALL ON FUNCTION public.reconcile_addon_refund_event",
    );
    expect(activation.indexOf("'listing_promotion:'")).toBeLessThan(
      activation.indexOf("FOR UPDATE OF listing"),
    );
    expect(refund.indexOf("'listing_promotion:'")).toBeLessThan(
      refund.indexOf("FOR UPDATE;"),
    );
  });

  it("binds idempotency keys to the listing and requested operation", () => {
    expect(correctionMigration).toContain("promotion_request_key_conflict");
    expect(correctionMigration).toContain("v_expected_allocation_count");
    expect(correctionMigration).toContain("bool_and(listing_id = p_listing_id)");
    expect(correctionMigration).toContain(
      "count(*) FILTER (WHERE promotion_type = 'spotlight')",
    );
    expect(correctionMigration).toContain(
      "count(*) FILTER (WHERE promotion_type = 'priority')",
    );
  });

  it("expires elapsed active rows synchronously before renewal inserts", () => {
    const activation = sqlSection(
      correctionMigration,
      "CREATE OR REPLACE FUNCTION private.activate_listing_promotion",
      "CREATE OR REPLACE FUNCTION private.revoke_refunded_listing_promotions",
    );
    const expiryUpdate = activation.indexOf("SET status = 'expired'");
    const firstInsert = activation.indexOf(
      "INSERT INTO public.listing_promotion_allocations",
    );

    expect(expiryUpdate).toBeGreaterThanOrEqual(0);
    expect(firstInsert).toBeGreaterThan(expiryUpdate);
    expect(activation).toContain("AND ends_at <= now()");
  });

  it("enforces one canonical listing per new-build project without unit allocations", () => {
    expect(correctionMigration).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_listings_one_per_project",
    );
    expect(correctionMigration).toMatch(
      /ON public\.listings \(project_id\)\r?\n\s+WHERE project_id IS NOT NULL/,
    );
    expect(correctionMigration).toContain(
      "Canonical new-build promotion target",
    );
    expect(correctionMigration).not.toContain("REFERENCES public.project_units");
    expect(correctionMigration).not.toContain("INSERT INTO public.project_units");
  });

  it("reconciles partial and full promotion refunds by consumed request", () => {
    expect(correctionMigration).toContain("GROUP BY request_key");
    expect(correctionMigration).toContain("count(DISTINCT request_key)");
    expect(correctionMigration).toContain("v_credits_to_revoke");
    expect(correctionMigration).toContain("revoke_reason = 'stripe_refund'");
    expect(correctionMigration).toContain(
      "credits_consumed = GREATEST(credits_consumed - v_revoked_credit_count, 0)",
    );
    expect(correctionMigration).toContain(
      "GREATEST(NEW.credits_refunded, OLD.credits_refunded)",
    );
  });

  it("backfills and constrains runtime_mode against livemode on consumed ledgers", () => {
    expect(correctionMigration).toContain(
      "billing_subscriptions_runtime_livemode_consistent",
    );
    expect(correctionMigration).toContain(
      "addon_purchases_runtime_livemode_consistent",
    );
    expect(correctionMigration).toContain(
      "runtime_mode = CASE WHEN livemode THEN 'live' ELSE 'test' END",
    );
    expect(correctionMigration).toContain(
      "CHECK ((runtime_mode = 'live') = livemode) NOT VALID",
    );
    expect(correctionMigration).toContain("VALIDATE CONSTRAINT");
  });

  it("records only an exactly matched profile subscription product", () => {
    expect(remediationMigrationName).toMatch(
      /^20260714\d{6}_remediate_promotion_entitlements\.sql$/,
    );
    expect(Number(remediationMigrationName?.slice(0, 14))).toBeGreaterThan(
      20260714130310,
    );
    expect(remediationMigration).toContain(
      "(v_role::text = 'seller' AND bs.plan_key = 'pro')",
    );
    expect(remediationMigration).toContain(
      "(v_role::text = 'agent' AND bs.plan_key = 'agent_basic')",
    );
    expect(remediationMigration).toContain(
      "(v_role::text = 'developer' AND bs.plan_key = 'developer_pro')",
    );
    expect(remediationMigration).toContain(
      "p.subscription_product_id IS NOT NULL",
    );
    expect(remediationMigration).toContain(
      "bs.stripe_product_id = p.subscription_product_id",
    );
    expect(remediationMigration).not.toContain(
      "p.subscription_product_id IS NULL\n      OR",
    );
  });

  it("replaces singular admin writes with one atomic dual-product RPC", () => {
    expect(remediationMigration).toMatch(
      /CREATE OR REPLACE FUNCTION private\.admin_set_listing_promotions[\s\S]*?SECURITY DEFINER/,
    );
    expect(remediationMigration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.admin_set_listing_promotions[\s\S]*?SECURITY INVOKER/,
    );
    expect(remediationMigration).toContain("p_spotlight_enabled boolean");
    expect(remediationMigration).toContain("p_priority_enabled boolean");
    expect(remediationMigration).toContain(
      "DROP FUNCTION IF EXISTS public.admin_set_listing_promotion",
    );
    expect(remediationMigration).toContain("source_type = 'admin'");
    expect(remediationMigration).toContain("billing_subscription_id = NULL");
    expect(remediationMigration).toContain("addon_purchase_id = NULL");
    expect(remediationMigration).toContain("plan_cycle_start = NULL");
    expect(remediationMigration).toContain("revoked_at = NULL");
    expect(remediationMigration).toContain("revoke_reason = NULL");
  });

  it("repairs legacy Priority independently from Spotlight expiry", () => {
    const repair = sqlSection(
      remediationMigration,
      "CREATE OR REPLACE FUNCTION private.repair_legacy_priority_promotions",
      "REVOKE ALL ON FUNCTION private.remediate_legacy_listing_promotions",
    );

    expect(repair).toContain(
      "private.remediate_legacy_listing_promotions(p_grant_started_at)",
    );
    expect(remediationMigration).toMatch(
      /SELECT listing\.id, listing\.owner_id, 'priority', listing\.priority_until[\s\S]*?WHERE listing\.priority_placement > 0[\s\S]*?listing\.priority_until IS NULL OR listing\.priority_until > p_observed_at/,
    );
    expect(remediationMigration).toMatch(
      /SELECT private\.remediate_legacy_listing_promotions\(\s*transaction_timestamp\(\)\s*\)/,
    );
  });

  it("uses boolean Priority and query-aligned promotion indexes", () => {
    expect(remediationMigration).toContain(
      "CHECK (priority_placement IN (0, 1))",
    );
    expect(remediationMigration).toContain(
      "ON public.listings (priority_placement DESC, created_at DESC, id DESC)",
    );
    expect(remediationMigration).toContain(
      "WHERE status = 'active' AND is_off_market = false AND is_featured = true",
    );
    expect(remediationMigration).toContain(
      "idx_listing_promotion_addon_purchase_id",
    );
    expect(remediationMigration).toContain(
      "idx_listing_promotion_billing_subscription_id",
    );
    expect(remediationMigration).toContain(
      "idx_listing_promotion_created_by",
    );
  });

  it("keeps private projection sync explicitly callable by service operations", () => {
    expect(correctionMigration).toMatch(
      /GRANT EXECUTE ON FUNCTION private\.sync_listing_promotion_projection\(uuid\)\s+TO service_role/,
    );
  });
});
