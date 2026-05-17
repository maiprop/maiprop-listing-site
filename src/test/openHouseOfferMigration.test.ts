import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260514142236_harden_open_house_offer_workflow.sql"),
  "utf8",
);

describe("open-house offer hardening migration", () => {
  it("enforces one accepted offer per listing", () => {
    expect(migration).toContain("idx_open_house_one_accepted_offer_per_listing");
    expect(migration).toContain("WHERE status = 'accepted'");
  });

  it("serializes winner selection and exposes atomic RPCs", () => {
    expect(migration).toContain("pg_advisory_xact_lock(hashtext(NEW.listing_id::text))");
    expect(migration).toContain("maiprop.open_house_accept_rpc");
    expect(migration).toContain("accepted_offers_must_use_accept_rpc");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.submit_open_house_offer");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.accept_open_house_offer");
  });

  it("keeps submit eligibility at the database boundary", () => {
    expect(migration).toContain("only_attendees_can_submit_offers");
    expect(migration).toContain("sealed_bid_deadline_passed");
    expect(migration).toContain("bids_cannot_be_revealed_before_deadline");
  });
});
