import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrations = resolve(process.cwd(), "supabase/migrations");
const migrationName = readdirSync(migrations).find((name) =>
  /^\d{14}_authorize_typing_presence_channels\.sql$/.test(name)
);
const migration = migrationName
  ? readFileSync(resolve(migrations, migrationName), "utf8")
  : "";

describe("typing Realtime authorization", () => {
  it("authorizes only the current JWT participant through a boolean helper", () => {
    expect(migrationName).toBeTruthy();
    expect(migration).toContain("private.can_access_typing_topic(p_topic text)");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("conversation.participant_a = (SELECT auth.uid())");
    expect(migration).toContain("conversation.participant_b = (SELECT auth.uid())");
    expect(migration).not.toContain("p_user_id");
  });

  it("keeps both Realtime presence directions participant-scoped", () => {
    expect(migration).toContain('CREATE POLICY "typing_channel_participant_select"');
    expect(migration).toContain('CREATE POLICY "typing_channel_participant_insert"');
    expect(
      migration.match(/realtime\.messages\.extension IN \('broadcast', 'presence'\)/g)
    ).toHaveLength(2);
    expect(migration.match(/private\.can_access_typing_topic/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
