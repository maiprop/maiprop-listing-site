import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260726205309_fix_owned_public_storage_cleanup.sql",
  ),
  "utf8",
);

describe("owned public storage cleanup migration", () => {
  it("moves cross-table document authorization behind private security-definer helpers", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION private.can_select_message_attachment",
    );
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION private.can_select_open_house_document",
    );
    expect(migration.match(/SECURITY DEFINER/g)).toHaveLength(2);
    expect(migration.match(/SET search_path = ''/g)).toHaveLength(2);
    expect(migration).toContain("REVOKE ALL ON FUNCTION private.can_select_message_attachment");
    expect(migration).toContain("REVOKE ALL ON FUNCTION private.can_select_open_house_document");
    expect(migration).toContain("TO authenticated, service_role");
  });

  it("lets authenticated owners select their public listing and project objects for deletion", () => {
    expect(migration).toContain(
      'DROP POLICY IF EXISTS "storage_objects_authenticated_select" ON storage.objects',
    );
    expect(migration).toContain(
      'CREATE POLICY "storage_objects_authenticated_select"',
    );
    expect(migration).toContain("bucket_id = 'listing-images'");
    expect(migration).toContain("bucket_id = 'project-media'");
    expect(migration).toContain(
      "(storage.foldername(name))[1] = (SELECT auth.uid())::TEXT",
    );
  });

  it("preserves private proof, message, and open-house document access rules", () => {
    expect(migration).toContain("bucket_id = 'firesale-proof-docs'");
    expect(migration).toContain("private.has_platform_admin((SELECT auth.uid()))");
    expect(migration).toContain("bucket_id = 'message-attachments'");
    expect(migration).toContain("private.can_select_message_attachment");
    expect(migration).toContain("bucket_id = 'open-house-docs'");
    expect(migration).toContain("private.can_select_open_house_document");
  });
});
