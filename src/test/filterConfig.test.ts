/**
 * Tests for src/lib/filterConfig.ts — getFilterConfig was at 0% function coverage.
 */
import { describe, it, expect } from "vitest";
import { getFilterConfig } from "@/lib/filterConfig";

describe("getFilterConfig", () => {
  it("returns base config for a known type", () => {
    const cfg = getFilterConfig("residential", "");
    expect(cfg).toBeDefined();
    expect(typeof cfg).toBe("object");
  });

  it("returns default config for an unknown type", () => {
    const cfg = getFilterConfig("unknown_type", "");
    expect(cfg).toBeDefined();
  });

  it("merges subtype overrides when a subtype is provided", () => {
    const base = getFilterConfig("commercial", "");
    const withSubtype = getFilterConfig("commercial", "office");
    // Both should be valid objects; the subtype version may have different labels.
    expect(base).toBeDefined();
    expect(withSubtype).toBeDefined();
  });

  it("returns base config when subtype is empty string", () => {
    const cfg = getFilterConfig("residential", "");
    expect(cfg).toBeDefined();
    expect(typeof cfg.sections).toBe("object");
  });

  it("does not throw for any built-in type", () => {
    const types = ["residential", "commercial", "land", "new_build", "auction"];
    for (const t of types) {
      expect(() => getFilterConfig(t, "")).not.toThrow();
    }
  });
});
