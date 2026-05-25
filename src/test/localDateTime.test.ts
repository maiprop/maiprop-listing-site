import { describe, expect, it } from "vitest";
import { createLocalDateTimeIso, formatLocalDateInput } from "@/lib/localDateTime";

describe("localDateTime helpers", () => {
  it("formats dates from local calendar fields instead of UTC day slices", () => {
    expect(formatLocalDateInput(new Date(2026, 4, 24, 23, 30))).toBe("2026-05-24");
  });

  it("converts local date and time selections to an ISO instant", () => {
    const expected = new Date("2026-05-24T10:00:00").toISOString();
    expect(createLocalDateTimeIso("2026-05-24", "10:00")).toBe(expected);
  });
});
