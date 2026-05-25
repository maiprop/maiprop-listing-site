import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260524150533_interaction_notifications.sql"),
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
});
