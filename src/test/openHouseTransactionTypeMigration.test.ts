import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260614091438_add_open_house_transaction_type.sql"),
  "utf8",
);

describe("open-house transaction type migration", () => {
  it("adds a sale/rent subcategory for open-house listings without changing listing_type", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS open_house_transaction_type TEXT");
    expect(migration).toContain("open_house_transaction_type IN ('sale', 'rent')");
    expect(migration).toContain("listing_type = 'open_house'::public.listing_type");
    expect(migration).toContain("SET open_house_transaction_type = 'sale'");
  });
});
