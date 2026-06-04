import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260707155000_isolate_firesale_proof_documents.sql"),
  "utf8",
);

describe("firesale proof document isolation migration", () => {
  it("creates a private PDF-only firesale proof bucket with user-owned paths", () => {
    expect(migration).toContain("'firesale-proof-docs'");
    expect(migration).toContain("file_size_limit = 5242880");
    expect(migration).toContain("allowed_mime_types = ARRAY['application/pdf']");
    expect(migration).toContain("CREATE POLICY \"Firesale proof docs own insert\"");
    expect(migration).toContain("(storage.foldername(name))[1] = (SELECT auth.uid())::text");
    expect(migration).toContain("(storage.foldername(name))[2] = 'firesale'");
  });

  it("tightens legacy open-house document host reads to the specific listing path", () => {
    expect(migration).toContain("DROP POLICY IF EXISTS \"Open house docs read owner or listing owner\"");
    expect(migration).toContain("(storage.foldername(name))[2] = r.listing_id::text");
    expect(migration).toContain("l.owner_id = (SELECT auth.uid())");
    expect(migration).toContain("public.has_platform_admin((SELECT auth.uid()))");
  });
});
