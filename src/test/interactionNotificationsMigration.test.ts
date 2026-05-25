import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260524150533_interaction_notifications.sql"),
  "utf8",
);

const newBuildInterestMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260524185805_notify_new_build_interest_from_trigger.sql"),
  "utf8",
);

describe("interaction notifications migration", () => {
  it("notifies receivers for messages, viewings, and consultations without client inserts", () => {
    expect(migration).toContain("CREATE SCHEMA IF NOT EXISTS private");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("private.insert_interaction_notification");
    expect(migration).toContain("REVOKE ALL ON FUNCTION private.insert_interaction_notification");
    expect(migration).toContain("interaction_notify_viewing_created");
    expect(migration).toContain("interaction_notify_viewing_status_changed");
    expect(migration).toContain("interaction_notify_consultation_created");
    expect(migration).toContain("interaction_notify_consultation_status_changed");
    expect(migration).toContain("interaction_notify_message_created");
    expect(migration).toContain("'/dashboard?tab=viewings'");
    expect(migration).toContain("'/dashboard?tab=booking'");
    expect(migration).toContain("'/messages'");
  });

  it("notifies developers for new-build interest through a trigger", () => {
    expect(newBuildInterestMigration).toContain("private.notify_new_build_interest_created");
    expect(newBuildInterestMigration).toContain("private.insert_interaction_notification");
    expect(newBuildInterestMigration).toContain("new_building_leads_notify_owner");
    expect(newBuildInterestMigration).toContain("AFTER INSERT ON public.new_building_leads");
    expect(newBuildInterestMigration).toContain("'new_interest'");
    expect(newBuildInterestMigration).toContain("'/dashboard?tab=leads'");
    expect(newBuildInterestMigration).toContain("REVOKE ALL ON FUNCTION private.notify_new_build_interest_created()");
  });
});
