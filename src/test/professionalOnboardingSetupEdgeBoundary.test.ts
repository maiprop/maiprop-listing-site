import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readText = (path: string) => readFileSync(path, "utf8");

describe("professional onboarding setup edge boundary", () => {
  it("keeps services, availability, and video mutations out of the onboarding page", () => {
    const source = readText("src/pages/Onboarding.tsx");

    expect(source).toContain('save-professional-onboarding');
    expect(source).not.toContain('.from("professional_services")');
    expect(source).not.toContain('.from("professional_availability")');
    expect(source).not.toMatch(/\.from\(["']professionals["']\)\s*[\r\n. ]*update\(/);
  });

  it("defines an authenticated edge function for professional onboarding setup", () => {
    const config = readText("supabase/config.toml");
    const source = readText("supabase/functions/save-professional-onboarding/index.ts");

    expect(config).toContain("[functions.save-professional-onboarding]");
    expect(config).toContain("verify_jwt = true");
    expect(source).toContain("verifyBearerToken");
    expect(source).toContain('"professional_services"');
    expect(source).toContain('"professional_availability"');
    expect(source).toContain('"professionals"');
    expect(source).toContain("user.id");
  });

  it("does not keep stale browser-mutation exceptions for onboarding setup tables", () => {
    const policy = JSON.parse(readText("docs/governance/sensitive-mutation-boundaries.json")) as {
      allowedBrowserMutations: Array<{ file: string; table: string }>;
    };
    const staleTables = new Set(["professional_services", "professional_availability", "professionals"]);

    expect(policy.allowedBrowserMutations.filter((entry) =>
      entry.file === "src/pages/Onboarding.tsx" && staleTables.has(entry.table)
    )).toEqual([]);
  });
});
