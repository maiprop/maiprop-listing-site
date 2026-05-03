import { describe, it, expect } from "vitest";
import {
  formatPrice,
  formatPriceFromCents,
  formatDate,
  formatDateTime,
  fmtDate,
  fmtTime,
} from "@/lib/format";

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

describe("formatPriceFromCents", () => {
  it("formats 49 cents with two decimals (regression: do NOT round to whole euros)", () => {
    // Sub-€0.50 credits used to render as "€0" because Math.round was applied
    // in cents/100 conversions. Should now show "€0,49".
    expect(formatPriceFromCents(49)).toMatch(/0,49/);
    expect(formatPriceFromCents(49)).not.toBe("€0");
  });

  it("formats 99 cents with two decimals", () => {
    expect(formatPriceFromCents(99)).toMatch(/0,99/);
  });

  it("formats whole euros with two trailing decimals", () => {
    expect(formatPriceFromCents(14900)).toMatch(/149,00/);
  });

  it("formats large amounts with thousands separator", () => {
    expect(formatPriceFromCents(150000_00)).toMatch(/150[.,\u00A0\u202F]000,00/);
  });

  it("returns em-dash for null", () => {
    expect(formatPriceFromCents(null)).toBe("—");
  });

  it("returns em-dash for undefined", () => {
    expect(formatPriceFromCents(undefined)).toBe("—");
  });

  it("returns em-dash for NaN", () => {
    expect(formatPriceFromCents(NaN)).toBe("—");
  });

  it("includes euro sign", () => {
    expect(formatPriceFromCents(100)).toContain("€");
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
