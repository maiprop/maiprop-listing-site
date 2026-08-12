import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260526073830_scope_consultation_video_rooms_and_contact_admin_fields.sql"),
  "utf8",
);

const latestRealtimePolicyMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260707160000_fix_realtime_video_room_auth_uid_policy.sql"),
  "utf8",
).replace(/\s+/g, " ");

const turnAuthorizationMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260729094658_authorize_video_room_turn_credentials.sql",
  ),
  "utf8",
).replace(/\s+/g, " ");

const roomHook = readFileSync(
  resolve(process.cwd(), "src/hooks/useMaiPropVideoRoom.ts"),
  "utf8",
);

describe("video room authorization hardening", () => {
  it("forces private realtime channels in the browser client", () => {
    expect(roomHook).toContain("private: true");
    expect(roomHook).not.toContain("VITE_MAIPROP_PRIVATE_VIDEO_ROOMS");
  });

  it("requires viewing participants and confirmed video status for viewing rooms", () => {
    expect(migration).toContain("v.viewing_type = 'video'");
    expect(migration).toContain("v.status = 'confirmed'");
    expect(migration).toContain(") IN (v.owner_id, v.requester_id)");
  });

  it("requires scoped confirmed video consultation participation for consultation rooms", () => {
    expect(migration).toContain("video:consultation:%");
    expect(migration).toContain("cr.id = NULLIF");
    expect(migration).toContain("JOIN public.professionals p ON p.id = cr.professional_id");
    expect(migration).toContain("cr.request_type = 'consultation'");
    expect(migration).toContain("cr.status = 'confirmed'");
    expect(migration).toContain("cr.meeting_type = 'video'");
    expect(migration).toContain("OR cr.requester_id = COALESCE");
  });

  it("keeps legacy professional rooms owner-only", () => {
    expect(migration).toContain("p.user_id = COALESCE");
    expect(migration).not.toContain("WHERE cr.professional_id = p.id");
  });

  it("uses the full UUID shape in realtime policy regex checks", () => {
    const malformedUuidPattern = String.raw`[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`;
    const fullUuidPattern = String.raw`[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`;

    expect(migration).not.toContain(malformedUuidPattern);
    expect(migration.split(fullUuidPattern).length - 1).toBeGreaterThanOrEqual(6);
  });

  it("keeps the final realtime video-room policy on authenticated auth.uid checks", () => {
    expect(latestRealtimePolicyMigration).toContain('DROP POLICY IF EXISTS "video_room_channel_select" ON realtime.messages');
    expect(latestRealtimePolicyMigration).toContain('FOR SELECT TO authenticated');
    expect(latestRealtimePolicyMigration).toContain('FOR INSERT TO authenticated');
    expect(latestRealtimePolicyMigration).toContain("CREATE OR REPLACE FUNCTION public.uuid_from_realtime_topic");
    expect(latestRealtimePolicyMigration).toContain("candidate::uuid");
    expect(latestRealtimePolicyMigration).toContain("v.status = 'confirmed'::public.viewing_status");
    expect(latestRealtimePolicyMigration).toContain("v.owner_id = (SELECT auth.uid()) OR v.requester_id = (SELECT auth.uid())");
    expect(latestRealtimePolicyMigration).toContain("public.uuid_from_realtime_topic((SELECT realtime.topic()), 'video:viewing')");
    expect(latestRealtimePolicyMigration).toContain('DROP POLICY IF EXISTS "typing_channel_participant_select" ON realtime.messages');
    expect(latestRealtimePolicyMigration).toContain("public.uuid_from_realtime_topic((SELECT realtime.topic()), 'typing')");
    expect(latestRealtimePolicyMigration).not.toContain("NULLIF(SUBSTRING(realtime.topic() FROM 8)");
    expect(latestRealtimePolicyMigration).not.toContain("regexp_replace((SELECT realtime.topic())");
    expect(latestRealtimePolicyMigration).not.toContain("request.jwt.claims");
  });

  it("shares the final room authorization rule with TURN credential issuance", () => {
    expect(turnAuthorizationMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.can_access_video_room(p_topic text)",
    );
    expect(turnAuthorizationMigration).toContain(
      "SECURITY DEFINER SET search_path = ''",
    );
    expect(turnAuthorizationMigration).toContain(
      "REVOKE ALL ON FUNCTION public.can_access_video_room(text) FROM PUBLIC, anon",
    );
    expect(turnAuthorizationMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.can_access_video_room(text) TO authenticated, service_role",
    );
    expect(turnAuthorizationMigration).toContain(
      "OR public.can_access_video_room((SELECT realtime.topic()))",
    );
    expect(turnAuthorizationMigration).toContain(
      "viewing.status = 'confirmed'::public.viewing_status",
    );
    expect(turnAuthorizationMigration).toContain(
      "request.meeting_type = 'video'",
    );
  });
});
