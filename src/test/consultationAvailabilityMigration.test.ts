import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260524190143_validate_consultation_availability_preferences.sql"),
  "utf8",
);

describe("consultation availability validation migration", () => {
  it("keeps non-consultation and unscheduled manual requests available", () => {
    expect(migration).toContain("NEW.request_type IS DISTINCT FROM 'consultation'");
    expect(migration).toContain("NEW.preferred_date IS NULL AND NEW.preferred_time IS NULL");
    expect(migration).toContain("v_active_availability_count = 0");
  });

  it("requires scheduled consultation preferences to match active availability", () => {
    expect(migration).toContain("EXTRACT(DOW FROM NEW.preferred_date)");
    expect(migration).toContain("v_preferred_time >= pa.start_time");
    expect(migration).toContain("v_preferred_time <= pa.end_time");
    expect(migration).toContain("Preferred consultation time is outside professional availability");
  });
});
