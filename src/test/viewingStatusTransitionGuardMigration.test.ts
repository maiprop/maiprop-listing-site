import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260707154000_guard_viewing_status_transitions.sql"),
  "utf8",
);

describe("viewing status transition guard migration", () => {
  it("keeps video room confirmation and completion owner-controlled at the DB boundary", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.guard_viewing_status_transitions()");
    expect(migration).toContain("NEW.status IN ('confirmed', 'completed')");
    expect(migration).toContain("v_actor <> OLD.owner_id");
    expect(migration).toContain("Only the listing owner can confirm or complete a viewing");
    expect(migration).toContain("trg_guard_viewing_status_transitions");
  });

  it("preserves requester cancellation without allowing requester confirmation", () => {
    expect(migration).toContain("NEW.status = 'cancelled'");
    expect(migration).toContain("v_actor NOT IN (OLD.owner_id, OLD.requester_id)");
    expect(migration).toContain("Only the listing owner or requester can cancel a viewing");
  });
});
