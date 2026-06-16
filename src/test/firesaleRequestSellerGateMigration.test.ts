import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260616165000_restore_firesale_seller_insert_gate.sql",
);

describe("firesale request seller insert gate migration", () => {
  it("restores seller-only database enforcement after the ownership-only policy", () => {
    expect(existsSync(migrationPath)).toBe(true);

    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain('DROP POLICY IF EXISTS "firesale_requests_insert" ON public.firesale_requests');
    expect(migration).toContain('CREATE POLICY "firesale_requests_insert"');
    expect(migration).toContain("FOR INSERT");
    expect(migration).toContain("TO authenticated");
    expect(migration).toContain("user_id = (SELECT auth.uid())");
    expect(migration).toContain("public.authoritative_role((SELECT auth.uid())) = 'seller'::public.user_role");
    expect(migration).not.toContain("user_id IS NULL");
  });
});
