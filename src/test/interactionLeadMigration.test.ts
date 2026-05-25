import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260524160000_auto_capture_interaction_leads.sql"),
  "utf8",
);

const newBuildLeadMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260524171039_auto_capture_new_build_project_leads.sql"),
  "utf8",
);

const canonicalLeadMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260525082323_canonical_lead_upsert_and_contact_inbox.sql"),
  "utf8",
);

describe("interaction lead auto-capture migration", () => {
  it("captures viewings, consultations, and conversations without opening leads RLS", () => {
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.create_viewing_owner_lead()");
    expect(migration).toContain("viewings_create_owner_lead");
    expect(migration).toContain("consultation_requests_create_owner_lead");
    expect(migration).toContain("conversations_create_owner_lead");
    expect(migration).toContain("'listing_inquiry'");
    expect(migration).toContain("'viewing'");
    expect(migration).toContain("'consultation'");
  });

  it("captures new-build registrations into CRM and project lead records", () => {
    expect(newBuildLeadMigration).toContain("CREATE TABLE IF NOT EXISTS public.new_building_leads");
    expect(newBuildLeadMigration).toContain("private.create_new_build_project_leads");
    expect(newBuildLeadMigration).toContain("new_building_leads_create_project_leads");
    expect(newBuildLeadMigration).toContain("existing.source = 'listing_inquiry'");
    expect(newBuildLeadMigration).toContain("source = 'project_inquiry'");
    expect(newBuildLeadMigration).toContain("INSERT INTO public.project_leads");
    expect(newBuildLeadMigration).toContain("REVOKE ALL ON FUNCTION private.create_new_build_project_leads()");
  });

  it("dedupes auto-captured leads through the canonical CRM helper", () => {
    expect(canonicalLeadMigration).toContain("private.upsert_owner_lead");
    expect(canonicalLeadMigration).toContain("private.merge_duplicate_auto_leads");
    expect(canonicalLeadMigration).toContain("idx_leads_auto_unique_email_context");
    expect(canonicalLeadMigration).toContain("idx_leads_auto_unique_phone_context");
    expect(canonicalLeadMigration).toContain("private.capture_viewing_owner_lead");
    expect(canonicalLeadMigration).toContain("private.capture_consultation_owner_lead");
    expect(canonicalLeadMigration).toContain("private.capture_conversation_owner_lead");
  });

  it("bridges project leads and platform submissions without turning them into browser-side CRM writes", () => {
    expect(canonicalLeadMigration).toContain("project_leads_sync_owner_lead");
    expect(canonicalLeadMigration).toContain("private.sync_project_lead_to_owner_lead");
    expect(canonicalLeadMigration).toContain("contact_submissions_status_check");
    expect(canonicalLeadMigration).toContain("Platform admin can update submissions");
    expect(canonicalLeadMigration).toContain("CREATE TABLE IF NOT EXISTS public.contact_submissions");
  });
});
