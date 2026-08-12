import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260726221523_require_listing_owner_for_public_promotion_rpc.sql",
  ),
  "utf8",
);

const principalCorrection = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260728093154_align_managed_catalogue_and_promotion_principal.sql",
  ),
  "utf8",
);

const adminMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260714112834_listing_promotion_entitlements.sql",
  ),
  "utf8",
);

describe("owner-only public promotion RPC boundary", () => {
  it("requires the authenticated actor to be the accountable listing owner", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.activate_listing_promotion",
    );
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.deactivate_listing_promotion",
    );
    expect(migration.match(/v_owner_id IS DISTINCT FROM v_actor/g)).toHaveLength(2);
    expect(migration.match(/RAISE EXCEPTION 'listing_promotion_forbidden'/g)).toHaveLength(2);
    expect(migration).not.toContain("has_platform_admin");
  });

  it("does not expose private allocation functions to browser roles", () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION private\.activate_listing_promotion\(uuid, text, text\)\s+FROM PUBLIC, anon, authenticated;/,
    );
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION private\.deactivate_listing_promotion\(uuid, text\)\s+FROM PUBLIC, anon, authenticated;/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.activate_listing_promotion\(uuid, text, text\)\s+TO authenticated;/,
    );
  });

  it("preserves the dedicated service-only admin grant ledger path", () => {
    expect(adminMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.admin_set_listing_promotion",
    );
    expect(adminMigration).toMatch(
      /source_type,[\s\S]*?'admin'/,
    );
    expect(adminMigration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.admin_set_listing_promotion\(uuid, text, boolean, timestamptz, uuid\) TO service_role;/,
    );
  });

  it("fails closed for organization listings until an organization ledger exists", () => {
    expect(principalCorrection).toContain(
      "CREATE OR REPLACE FUNCTION public.activate_listing_promotion",
    );
    expect(principalCorrection).toContain(
      "CREATE OR REPLACE FUNCTION public.deactivate_listing_promotion",
    );
    expect(principalCorrection.match(/v_organization_id IS NOT NULL/g)).toHaveLength(2);
    expect(principalCorrection.match(/RAISE EXCEPTION 'organization_promotion_billing_required'/g)).toHaveLength(2);
    expect(principalCorrection).toContain(
      "Personal credits cannot fund organization-owned listing promotions",
    );
  });
});
