import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260722041222_secure_listing_mutation_boundary.sql",
  ),
  "utf8",
);

describe("authenticated listing mutation boundary", () => {
  it("uses a positive client-field allowlist and derives system values", () => {
    const allowlist = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION private.listing_client_writable_columns"),
      migration.indexOf("CREATE OR REPLACE FUNCTION private.assert_listing_payload_keys"),
    );
    expect(migration).toContain("private.listing_client_writable_columns()");
    expect(migration).toContain("listing_fields_not_writable");
    expect(migration).toContain("p_payload - 'price_per_sqm'");
    expect(migration).toContain("round(v_price / v_sqm)");
    expect(allowlist).not.toMatch(/'owner_id'|'organization_id'|'is_featured'|'priority_placement'/);
  });

  it("keeps authentication, ownership, quota and new-build rules server-side", () => {
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain("listing_not_owned");
    expect(migration).toContain("public.check_listing_quota()");
    expect(migration).toContain("listing_limit_reached");
    expect(migration).toContain("new_build_requires_project_boundary");
    expect(migration).toContain("private.has_org_permission(");
  });

  it("exposes only authenticated wrappers and removes raw browser DML", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.create_listing_for_user");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.update_listing_for_user");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.delete_listing_for_user");
    expect(migration).toContain(
      "REVOKE INSERT, UPDATE, DELETE ON TABLE public.listings FROM authenticated",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.create_listing_for_user(jsonb) TO authenticated",
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION private.listing_client_writable_columns() FROM PUBLIC",
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION private.assert_listing_payload_keys(jsonb) FROM PUBLIC",
    );
  });
});
