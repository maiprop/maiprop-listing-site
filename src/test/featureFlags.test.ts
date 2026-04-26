/**
 * Tests for featureFlags. Vite's `import.meta.env` is read by the module at
 * call time — vitest's vi.stubEnv handles this for VITE_* keys.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { isEnabled, useFlag, listFlags } from "@/lib/featureFlags";

describe("featureFlags", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  describe("isEnabled", () => {
    it("returns false when the flag is unset", () => {
      expect(isEnabled("UNSET_FLAG_NAME_FOR_TEST")).toBe(false);
    });

    it.each([
      ["1", true],
      ["true", true],
      ["TRUE", true],
      ["yes", true],
      ["YES", true],
      ["on", true],
      ["ON", true],
    ])("treats %s as enabled", (raw, expected) => {
      vi.stubEnv("VITE_FF_TEST_FLAG", raw);
      expect(isEnabled("TEST_FLAG")).toBe(expected);
    });

    it.each([
      ["0", false],
      ["false", false],
      ["no", false],
      ["off", false],
      ["", false],
      ["random", false],
    ])("treats %s as disabled", (raw, expected) => {
      vi.stubEnv("VITE_FF_TEST_FLAG", raw);
      expect(isEnabled("TEST_FLAG")).toBe(expected);
    });

    it("uppercases the supplied flag name", () => {
      vi.stubEnv("VITE_FF_LOWER_CASE_FLAG", "1");
      expect(isEnabled("lower_case_flag")).toBe(true);
    });
  });

  describe("useFlag", () => {
    it("delegates to isEnabled", () => {
      vi.stubEnv("VITE_FF_HOOK_FLAG", "yes");
      expect(useFlag("HOOK_FLAG")).toBe(true);
    });

    it("returns false for an unset flag", () => {
      expect(useFlag("ANOTHER_UNSET_FLAG")).toBe(false);
    });
  });

  describe("listFlags", () => {
    it("includes only VITE_FF_* keys with their resolved boolean values", () => {
      vi.stubEnv("VITE_FF_ALPHA", "1");
      vi.stubEnv("VITE_FF_BETA", "no");
      vi.stubEnv("VITE_NOT_A_FLAG", "1");
      const flags = listFlags();
      expect(flags.ALPHA).toBe(true);
      expect(flags.BETA).toBe(false);
      // The non-FF env var must not leak into the result.
      expect(Object.keys(flags)).not.toContain("NOT_A_FLAG");
    });
  });
});
