import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = resolve(process.cwd(), "supabase/migrations");
const migration = readFileSync(
  resolve(
    migrationsDir,
    "20260728123058_materialize_public_catalogue_snapshots.sql",
  ),
  "utf8",
);

describe("public catalogue fixture exclusion migration", () => {
  it("folds fixture exclusion into the unpublished temporal publisher", () => {
    expect(
      existsSync(
        resolve(
          migrationsDir,
          "20260728111312_exclude_public_catalogue_fixtures.sql",
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(
        resolve(
          migrationsDir,
          "20260728113658_snapshot_public_catalogue_eligibility.sql",
        ),
      ),
    ).toBe(false);
    expect(migration).toContain("private.publish_public_catalogue");
    expect(migration).toContain("supervisor-[0-9]+");
    expect(migration).toContain("e2e-full-publish");
    expect(migration).toContain("qa-full-publish");
    expect(migration).toContain("devin test");
    expect(migration).toContain("test free listing");
    expect(migration).toContain("listing.tags::text");
    expect(migration).not.toContain("to_jsonb(catalogue)");
  });
});
