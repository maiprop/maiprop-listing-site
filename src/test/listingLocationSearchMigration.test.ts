import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260709072309_add_listing_location_search_text.sql",
  "utf8",
);
const correctiveMigration = readFileSync(
  "supabase/migrations/20260709072653_fix_listing_location_search_text_normalizer.sql",
  "utf8",
);

describe("listing location search migration", () => {
  it("adds an indexed normalized search surface across listing location fields", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.normalize_location_text");
    expect(migration).toContain("location_search_text");
    expect(migration).toContain("coalesce(title, '')");
    expect(migration).toContain("coalesce(address, '')");
    expect(migration).toContain("coalesce(city, '')");
    expect(migration).toContain("coalesce(region, '')");
    expect(migration).toContain("coalesce(postal_code, '')");
    expect(migration).toContain("gin_trgm_ops");
  });

  it("normalizes Greek accents and adds genitive-plural variants for municipality searches", () => {
    expect(migration).toContain("'άέήίϊΐόύϋΰώς'");
    expect(migration).toContain("'αεηιιιουυυωσ'");
    expect(migration).toContain("^[[:alpha:]]{3,}ων$");
    expect(migration).toContain("regexp_replace(token, 'ων$', 'οι')");
    expect(correctiveMigration).toContain("DROP COLUMN IF EXISTS location_search_text");
    expect(correctiveMigration).toContain("regexp_replace(token, 'ων$', 'οι')");
  });
});
