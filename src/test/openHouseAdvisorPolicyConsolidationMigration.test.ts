import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260707152000_consolidate_open_house_advisor_policies.sql",
);
const migration = readFileSync(migrationPath, "utf8").replace(/\s+/g, " ");

describe("open-house advisor policy consolidation migration", () => {
  it("keeps bidder offer insert and delete as bidder-owned actions", () => {
    expect(migration).toContain('CREATE POLICY "oh_offers_insert"');
    expect(migration).toContain('CREATE POLICY "oh_offers_delete"');
    expect(migration).toContain("WITH CHECK (bidder_id = (SELECT auth.uid()))");
    expect(migration).toContain("USING (bidder_id = (SELECT auth.uid()))");
  });

  it("keeps offer read/update access for bidder or listing owner", () => {
    expect(migration).toContain('CREATE POLICY "oh_offers_select"');
    expect(migration).toContain('CREATE POLICY "oh_offers_update"');
    expect(migration).toContain("bidder_id = (SELECT auth.uid()) OR EXISTS");
    expect(migration).toContain("WHERE l.id = open_house_offers.listing_id");
    expect(migration).toContain("AND l.owner_id = (SELECT auth.uid())");
  });

  it("keeps registration creation pending and requester-owned", () => {
    expect(migration).toContain('CREATE POLICY "oh_regs_insert"');
    expect(migration).toContain("requester_id = (SELECT auth.uid())");
    expect(migration).toContain("AND status = 'pending'::oh_registration_status");
  });

  it("keeps registration read/update access for requester or listing owner", () => {
    expect(migration).toContain('CREATE POLICY "oh_regs_select"');
    expect(migration).toContain('CREATE POLICY "oh_regs_update"');
    expect(migration).toContain("WHERE l.id = open_house_registrations.listing_id");
    expect(migration).toContain("AND l.owner_id = (SELECT auth.uid())");
  });

  it("does not touch firesale policies in this lower-risk pass", () => {
    expect(migration).not.toContain("firesale_interest");
    expect(migration).not.toContain("firesale_requests");
  });
});
