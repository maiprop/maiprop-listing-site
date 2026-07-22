import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrations = resolve(process.cwd(), "supabase/migrations");
const migrationName = readdirSync(migrations).find((name) =>
  /^\d{14}_consolidate_remaining_rls_policies\.sql$/.test(name),
);
const migration = migrationName
  ? readFileSync(resolve(migrations, migrationName), "utf8")
  : "";

describe("remaining RLS policy consolidation", () => {
  it("removes ineffective and duplicate public-table policies", () => {
    expect(migrationName).toBeTruthy();

    for (const policy of [
      "agent_data_input_bans_insert_blocked",
      "agent_data_input_bans_update_blocked",
      "agent_data_input_bans_delete_blocked",
      "agent_data_input_bans_select_own_or_admin",
      "agent_data_inputs_insert_own",
      "agent_data_inputs_insert_blocked",
      "agent_data_inputs_update_blocked",
      "agent_data_inputs_delete_blocked",
      "Users insert own leads",
      "Users delete own leads",
      "role_switch_history_admin_select",
    ]) {
      expect(migration).toContain(`DROP POLICY IF EXISTS "${policy}"`);
    }

    expect(migration).toContain("Agent Data Input submissions are Edge-Function-only");
    expect(migration).toContain("database triggers remain authoritative");
    expect(migration).toContain('CREATE POLICY "agent_data_inputs_insert_blocked"');
    expect(migration).toContain("WITH CHECK (false)");
    expect(migration).toContain('CREATE POLICY "role_switch_history_select"');
    expect(migration).toContain("OR private.has_platform_admin((SELECT auth.uid()))");
  });

  it("combines typing and video-room Realtime access without widening either boundary", () => {
    expect(migration).toContain('CREATE POLICY "realtime_messages_participant_select"');
    expect(migration).toContain('CREATE POLICY "realtime_messages_participant_insert"');
    expect(migration).toContain("private.can_access_typing_topic");
    expect(migration).toContain("'video:viewing'");
    expect(migration).toContain("'video:consultation'");
    expect(migration).toContain("'video:professional'");
    expect(migration.match(/extension IN \('broadcast', 'presence'\)/g)).toHaveLength(2);
  });

  it("combines storage policies by action while retaining every bucket boundary", () => {
    for (const action of ["select", "insert", "update", "delete"]) {
      expect(migration).toContain(`CREATE POLICY "storage_objects_authenticated_${action}"`);
    }

    for (const bucket of [
      "avatars",
      "firesale-photos",
      "firesale-proof-docs",
      "listing-images",
      "message-attachments",
      "open-house-docs",
      "project-media",
      "property-images",
    ]) {
      expect(migration).toContain(`bucket_id = '${bucket}'`);
    }

    expect(migration).toContain("private.has_platform_admin");
    expect(migration).toContain("private.has_role");
    expect(migration).toContain("participant_a");
    expect(migration).toContain("participant_b");
  });
});
