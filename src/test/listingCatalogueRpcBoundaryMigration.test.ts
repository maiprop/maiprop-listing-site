import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260722060307_replace_definer_listing_views_with_scoped_rpcs.sql",
  ),
  "utf8",
).replace(/\r\n/g, "\n");

describe("listing catalogue RPC boundary migration", () => {
  it("makes catalogue views invoker-scoped and unavailable to API roles", () => {
    expect(migration.match(/SET \(security_invoker = true, security_barrier = true\)/g)).toHaveLength(3);
    expect(migration).toContain(
      "REVOKE ALL ON TABLE public.public_listing_catalogue\n  FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain(
      "REVOKE ALL ON TABLE public.listing_management_catalogue\n  FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain(
      "REVOKE ALL ON TABLE public.listing_reference_catalogue\n  FROM PUBLIC, anon, authenticated",
    );
    expect(migration).not.toMatch(/GRANT SELECT ON (?:TABLE )?public\.\w+_listing_catalogue/);
  });

  it("exposes fixed-search-path RPCs with explicit role grants", () => {
    expect(migration.match(/SECURITY DEFINER\nSET search_path = ''/g)).toHaveLength(3);
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_public_listing_catalogue()\n  TO anon, authenticated",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_listing_management_catalogue()\n  TO authenticated",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_listing_reference_catalogue()\n  TO anon, authenticated",
    );
    expect(migration).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_listing_management_catalogue\(\)\s+TO anon/,
    );
  });

  it("revokes default PUBLIC execution before granting the intended callers", () => {
    for (const functionName of [
      "get_public_listing_catalogue",
      "get_listing_management_catalogue",
      "get_listing_reference_catalogue",
    ]) {
      expect(migration).toContain(
        `REVOKE ALL ON FUNCTION public.${functionName}()\n  FROM PUBLIC, anon, authenticated`,
      );
    }
  });
});
