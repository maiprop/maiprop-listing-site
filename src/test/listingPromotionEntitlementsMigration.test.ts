import { readFileSync } from "node:fs";
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

describe("listing promotion entitlement migration", () => {
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

  it("keeps public promotion RPCs invoker-safe while privileged writes stay private", () => {
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
});
