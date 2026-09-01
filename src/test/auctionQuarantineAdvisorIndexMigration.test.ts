import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260901180000_index_auction_quarantine_canonical_fk.sql";

describe("auction quarantine advisor index migration", () => {
  it("indexes the canonical listing foreign key used by quarantine convergence", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain(
      "CREATE INDEX IF NOT EXISTS idx_os_auction_duplicate_quarantine_canonical_listing_id",
    );
    expect(migration).toContain(
      "ON private.os_auction_duplicate_quarantine (canonical_listing_id)",
    );
  });
});
