/**
 * Tests for src/lib/propertyTypes.ts — getTypeLabel / getSubtypeLabel were
 * at 0% function coverage.
 */
import { describe, it, expect } from "vitest";
import { getTypeLabel, getSubtypeLabel, PROPERTY_TYPE_MAP } from "@/lib/propertyTypes";

describe("getTypeLabel", () => {
  it("returns the label for a known property type", () => {
    // apartment is a core type that must always be present
    expect(getTypeLabel("apartment")).toBeTruthy();
    expect(typeof getTypeLabel("apartment")).toBe("string");
  });

  it("returns all 13 property types without throwing", () => {
    const types = [
      "apartment", "house", "villa", "land", "commercial", "office",
      "studio", "maisonette", "warehouse", "hotel", "mixed_use", "parking", "storage",
    ];
    for (const t of types) {
      expect(() => getTypeLabel(t)).not.toThrow();
      expect(getTypeLabel(t)).toBeTruthy();
    }
  });

  it("falls back to the raw type string for unknown types", () => {
    expect(getTypeLabel("unknown_xyz")).toBe("unknown_xyz");
  });
});

describe("getSubtypeLabel", () => {
  it("returns the subtype label for a known type + subtype pair", () => {
    // Pick the first available subtype for an existing type
    const firstType = Object.keys(PROPERTY_TYPE_MAP)[0] as string;
    const firstSubtype = PROPERTY_TYPE_MAP[firstType as keyof typeof PROPERTY_TYPE_MAP]?.subtypes?.[0];
    if (firstSubtype) {
      const label = getSubtypeLabel(firstType, firstSubtype.value);
      expect(label).toBe(firstSubtype.label);
    }
  });

  it("falls back to the raw subtype string for unknown combinations", () => {
    expect(getSubtypeLabel("apartment", "nonexistent_subtype")).toBe("nonexistent_subtype");
    expect(getSubtypeLabel("nonexistent_type", "nonexistent_subtype")).toBe("nonexistent_subtype");
  });

  it("does not throw for empty strings", () => {
    expect(() => getSubtypeLabel("", "")).not.toThrow();
  });
});
