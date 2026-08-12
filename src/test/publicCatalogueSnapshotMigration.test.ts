import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260728123058_materialize_public_catalogue_snapshots.sql",
  ),
  "utf8",
);

describe("public catalogue snapshot eligibility migration", () => {
  it("pins typed eligibility, promotion state, and keyset traversal to one publication", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.query_public_catalogue",
    );
    expect(migration).toContain("p_publication_id bigint DEFAULT NULL");
    expect(migration).toContain("p_sort text DEFAULT 'newest'");
    expect(migration).toContain("p_cursor_timestamp timestamptz DEFAULT NULL");
    expect(migration).toContain("p_cursor_numeric numeric DEFAULT NULL");
    expect(migration).toContain("p_cursor_listing_id uuid DEFAULT NULL");
    expect(migration).toContain("p_features text[] DEFAULT NULL");
    expect(migration).toContain("p_priority_mode text DEFAULT 'all'");
    expect(migration).toContain("p_open_house_mode text DEFAULT NULL");
    expect(migration).toContain("p_offset integer DEFAULT 0");
    expect(migration).toContain("p_location_groups jsonb DEFAULT NULL");
    expect(migration).toContain(
      "p_limit IS NULL OR p_limit < 1 OR p_limit > 201",
    );
    expect(migration).toContain(
      "p_offset IS NULL OR p_offset < 0 OR p_offset > 100000",
    );
    expect(migration).toContain("public_catalogue_invalid_location_groups");
    expect(migration).toContain("valid_from_publication <= v_publication_id");
    expect(migration).toContain(
      "v_publication_id < version.valid_to_publication",
    );
    expect(migration).toContain("allocation.starts_at <= v_snapshot");
    expect(migration).toContain("allocation.ends_at > v_snapshot");
    expect(migration).toContain("allocation.revoked_at > v_snapshot");
    expect(migration).toContain("private.resolve_public_catalogue_publication");
    expect(migration).toContain("public_catalogue_invalid_sort");
    expect(migration).toContain("public_catalogue_invalid_cursor");
    expect(migration).toContain("public_catalogue_duplicate_os_tag");
    expect(migration).toContain("version.os_tag = p_os_tag");
    expect(migration).toContain("LIMIT $37 OFFSET $38");
  });
});
