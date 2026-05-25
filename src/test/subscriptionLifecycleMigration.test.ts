import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260525171000_subscription_lifecycle_grace_and_lapse.sql"),
  "utf8",
);

describe("subscription lifecycle grace and lapse migration", () => {
  it("restores force_pro_access to the canonical SQL Pro helper after audience hardening", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.is_pro(p_user_id uuid)");
    expect(migration).toContain("SELECT p.force_pro_access");
    expect(migration).toContain("public.has_audience_scoped_pro_entitlement(p_user_id)");
    expect(migration).toContain("public.has_platform_admin(p_user_id)");
  });

  it("applies non-destructive downgrade controls only through service role", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.apply_subscription_lapse_controls");
    expect(migration).toContain("status = 'paused'::public.listing_status");
    expect(migration).toContain("email_alerts = FALSE");
    expect(migration).toContain("SET active = FALSE");
    expect(migration).toContain("INSERT INTO public.notifications");
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.apply_subscription_lapse_controls(uuid) TO service_role",
    );
    expect(migration).toContain("authenticated must not execute apply_subscription_lapse_controls directly");
  });

  it("preserves user data instead of deleting paid-created records", () => {
    expect(migration).not.toContain("DELETE FROM public.listings");
    expect(migration).not.toContain("DELETE FROM public.saved_searches");
    expect(migration).not.toContain("DELETE FROM public.auction_alerts");
    expect(migration).not.toContain("UPDATE public.viewings");
  });
});
