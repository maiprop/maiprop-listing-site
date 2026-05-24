import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260524165932_harden_video_room_authorization.sql"),
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

  it("requires professional ownership or confirmed consultation participation for professional rooms", () => {
    expect(migration).toContain("p.user_id = COALESCE");
    expect(migration).toContain("FROM public.consultation_requests cr");
    expect(migration).toContain("cr.requester_id = COALESCE");
    expect(migration).toContain("cr.request_type = 'consultation'");
    expect(migration).toContain("cr.status = 'confirmed'");
    expect(migration).not.toMatch(/\(SELECT realtime\.topic\(\)\) LIKE 'video:professional:%'\s+OR\s+\(SELECT realtime\.topic\(\)\) LIKE 'private:video:professional:%'\s+OR\s+\(SELECT realtime\.topic\(\)\) LIKE 'realtime:private:video:professional:%'\s+OR\s+\(/);
  });
});
