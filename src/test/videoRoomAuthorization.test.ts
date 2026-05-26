import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260526073830_scope_consultation_video_rooms_and_contact_admin_fields.sql"),
  "utf8",
);

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
});
