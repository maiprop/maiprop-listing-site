import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260525082723_firesale_pipeline_business_logic.sql"),
  "utf8",
);

describe("firesale pipeline business logic migration", () => {
  it("stores seller responses as structured fields and backfills legacy prefixes", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS seller_response TEXT");
    expect(migration).toContain("seller_response IN ('accepted', 'countered', 'rejected')");
    expect(migration).toContain("regexp_replace(admin_notes, '^\\[SELLER:");
  });

  it("extends the investor feed with sanitized economics and handles deletes", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS ai_estimate NUMERIC");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS bedrooms INTEGER");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS condition TEXT");
    expect(migration).toContain("IF TG_OP = 'DELETE' THEN");
    expect(migration).toContain("OR DELETE");
  });

  it("preserves admin-verified proof of funds on re-expression", () => {
    expect(migration).toContain("verified_proof_is_admin_managed");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.submit_firesale_interest");
    expect(migration).toContain("WHEN v_existing.proof_of_funds_verified_at IS NOT NULL THEN v_existing.proof_amount");
    expect(migration).toContain("WHEN v_existing.proof_of_funds_verified_at IS NOT NULL THEN v_existing.proof_of_funds_url");
  });

  it("targets notifications by business event instead of broadcasting all investor_mode users", () => {
    expect(migration).toContain("FROM public.firesale_interest fi");
    expect(migration).toContain("JOIN public.investor_subscriptions s ON s.user_id = p.user_id");
    expect(migration).toContain("p.role::text IN ('investor', 'institutional')");
    expect(migration).not.toContain("WHERE p.investor_mode = true");
  });

  it("expires reservations through pg_cron and notifies affected investors", () => {
    expect(migration).toContain("Quick Sale reservation expired");
    expect(migration).toContain("release-expired-firesale-reservations");
    expect(migration).toContain("'*/5 * * * *'");
    expect(migration).toContain("SELECT public.release_expired_firesale_reservations(NULL);");
  });
});
