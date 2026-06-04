import { describe, expect, it } from "vitest";
import { getPasswordRequirements, validatePassword } from "@/lib/passwordPolicy";

describe("passwordPolicy", () => {
  it("rejects common compromised passwords even when they satisfy complexity rules", () => {
    const result = validatePassword("Password1!");

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/common or compromised/i);
  });

  it("surfaces the compromised-password requirement in the visible checklist", () => {
    const requirements = getPasswordRequirements("Password1!");

    expect(requirements).toContainEqual(
      expect.objectContaining({
        id: "notCommon",
        met: false,
      }),
    );
  });
});
