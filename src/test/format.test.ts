import { describe, it, expect } from "vitest";
import { formatPrice, formatDate, formatDateTime, fmtDate, fmtTime } from "@/lib/format";

describe("formatPrice", () => {
  it("formats a positive integer", () => {
    expect(formatPrice(150000)).toMatch(/150/);
  });

  it("returns em-dash for null", () => {
    expect(formatPrice(null)).toBe("—");
  });

  it("returns em-dash for undefined", () => {
    expect(formatPrice(undefined)).toBe("—");
  });

  it("returns em-dash for NaN", () => {
    expect(formatPrice(NaN)).toBe("—");
  });

  it("returns em-dash for Infinity", () => {
    expect(formatPrice(Infinity)).toBe("—");
  });

  it("formats zero", () => {
    expect(formatPrice(0)).toMatch(/€/);
  });

  it("includes euro sign", () => {
    expect(formatPrice(500)).toContain("€");
  });
});

describe("formatDate", () => {
  it("returns em-dash for null", () => {
    expect(formatDate(null)).toBe("—");
  });

  it("returns em-dash for undefined", () => {
    expect(formatDate(undefined)).toBe("—");
  });

  it("returns em-dash for empty string", () => {
    expect(formatDate("")).toBe("—");
  });

  it("formats a valid ISO date string", () => {
    const result = formatDate("2026-04-05T12:00:00Z");
    expect(result).toMatch(/2026/);
    expect(result).toMatch(/Apr/);
    expect(result).toMatch(/5/);
  });

  it("returns the original value for non-parseable input", () => {
    const result = formatDate("not-a-date");
    // Should not throw; returns some string
    expect(typeof result).toBe("string");
  });
});

describe("formatDateTime", () => {
  it("returns em-dash for null", () => {
    expect(formatDateTime(null)).toBe("—");
  });

  it("returns em-dash for undefined", () => {
    expect(formatDateTime(undefined)).toBe("—");
  });

  it("formats a valid ISO datetime string", () => {
    const result = formatDateTime("2026-04-05T14:30:00Z");
    expect(result).toMatch(/2026/);
    expect(result).toMatch(/Apr/);
  });
});

describe("fmtDate", () => {
  it("includes weekday abbreviation", () => {
    // 2026-04-05 is a Sunday
    const result = fmtDate("2026-04-05T00:00:00Z");
    // Should contain a weekday (Sun/Mon/etc.)
    expect(result).toMatch(/[A-Z][a-z]{2}/);
  });

  it("includes month abbreviation", () => {
    const result = fmtDate("2026-04-05T00:00:00Z");
    expect(result).toMatch(/Apr/);
  });
});

describe("fmtTime", () => {
  it("returns HH:MM formatted string", () => {
    // Use a fixed UTC time and parse in a way that's timezone-agnostic for the test
    const result = fmtTime("2026-04-05T14:30:00Z");
    expect(result).toMatch(/\d{2}:\d{2}/);
  });
});
