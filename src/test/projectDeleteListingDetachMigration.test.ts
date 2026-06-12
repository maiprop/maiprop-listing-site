import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260612110536_harden_project_delete_listing_detach.sql"),
  "utf8",
);

describe("project delete listing detach migration", () => {
  it("source-controls the production-applied project detach trigger and RPC", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION private.unlink_project_listings_before_delete()");
    expect(migration).toContain("CREATE TRIGGER trg_unlink_project_listings_before_delete");
    expect(migration).toContain("BEFORE DELETE ON public.projects");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.delete_project_and_unlink_listings");
    expect(migration).toContain("listing_type = 'sale'::public.listing_type");
    expect(migration).toContain("is_pre_sale = false");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.delete_project_and_unlink_listings(uuid) TO authenticated, service_role");
  });

  it("keeps the live listing repair and apply-time assertions auditable", () => {
    expect(migration).toContain("'0308050d-8d62-4fc8-b421-7c74116343b3'::uuid");
    expect(migration).toContain("'5f762dec-2eb5-4463-a052-fcee02b39f24'::uuid");
    expect(migration).toContain("enumlabel = 'new_build'");
    expect(migration).toContain("listing_type::text = 'new_build'");
    expect(migration).not.toContain("listing_type = 'new_build'::public.listing_type");
    expect(migration).toContain("project delete listing detach trigger missing");
    expect(migration).toContain("Glyfada Loft listing must be standalone sale after repair");
  });
});
