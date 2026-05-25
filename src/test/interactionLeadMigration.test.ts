import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260524160000_auto_capture_interaction_leads.sql"),
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
});
