import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const documentation = readFileSync("docs/ONBOARDING_AND_USER_TYPES.md", "utf8");

describe("onboarding documentation contract", () => {
  it("documents the authoritative onboarding completion and mutation path", () => {
    expect(documentation).toContain("profiles.participant_type");
    expect(documentation).toContain("complete-onboarding-role");
    expect(documentation).toContain("begin-role-switch");
    expect(documentation).toContain("log-role-switch");
    expect(documentation).toContain("role_switch_in_progress_at");
  });

  it("does not describe legacy bio markers or direct profile writes as authoritative", () => {
    expect(documentation).not.toMatch(/bio`? (?:must|starts) with `?__type:/i);
    expect(documentation).not.toContain("updateProfile({ role })");
    expect(documentation).not.toContain("seller_landlord");
  });
});
