import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260514180344_fix_firesale_publication_status_ambiguity.sql"),
  "utf8",
);

describe("firesale publication status ambiguity migration", () => {
  it("uses the locked row status instead of an ambiguous unqualified status reference", () => {
    expect(migration).toContain("WHEN v_deal.status = 'reviewed' THEN 'pending'");
    expect(migration).toContain("ELSE v_deal.status");
    expect(migration).not.toContain("WHEN status = 'reviewed' THEN 'pending'");
  });

  it("keeps the admin-only execute grants explicit", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.admin_set_firesale_investor_publication(UUID, BOOLEAN) FROM PUBLIC, anon",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.admin_set_firesale_investor_publication(UUID, BOOLEAN) TO authenticated, service_role",
    );
  });
});
