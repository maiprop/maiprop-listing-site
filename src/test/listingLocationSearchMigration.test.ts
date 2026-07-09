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
const greeklishMigration = readFileSync(
  "supabase/migrations/20260709161307_expand_listing_location_search_greeklish.sql",
  "utf8",
);
const locationAliasMigration = readFileSync(
  "supabase/migrations/20260709170500_expand_location_search_aliases.sql",
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

  it("expands stored location search text with Greeklish variants for Latin address queries", () => {
    expect(greeklishMigration).toContain("replace(value, 'y', 'i')");
    expect(greeklishMigration).toContain("'avgdeziiklmnxoprstifo'");
    expect(greeklishMigration).toContain("'avgdeziiklmnxoprstyfo'");
    expect(greeklishMigration).toContain("DROP COLUMN IF EXISTS location_search_text");
  });

  it("adds Latin alias coverage for common Greek municipality inflections", () => {
    expect(locationAliasMigration).toContain("CREATE OR REPLACE FUNCTION public.expand_location_search_aliases");
    expect(locationAliasMigration).toContain("WHEN 'agioi' THEN 'agion agios'");
    expect(locationAliasMigration).toContain("WHEN 'anargiron' THEN 'anargiroi anargyroi anargyron'");
    expect(locationAliasMigration).toContain("WHEN 'kalimnou' THEN 'kalymnou'");
    expect(locationAliasMigration).toContain("public.expand_location_search_aliases(");
    expect(locationAliasMigration).toContain("DROP COLUMN IF EXISTS location_search_text");
  });
});
