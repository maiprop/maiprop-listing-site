import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readText = (path: string) => readFileSync(path, "utf8");

describe("professional onboarding edge boundary", () => {
  it("does not create the professional directory row directly from the browser", () => {
    const source = readText("src/pages/Onboarding.tsx");

    expect(source).toContain('complete-onboarding-role');
    expect(source).not.toMatch(/\.from\(["']professionals["']\)\s*[\r\n. ]*upsert\(/);
  });

  it("keeps the professional profile creation in the authenticated Edge function", () => {
    const source = readText("supabase/functions/complete-onboarding-role/index.ts");

    expect(source).toContain('verifyBearerToken');
    expect(source).toContain('.from("professionals")');
    expect(source).toContain("upsert");
    expect(source).toContain("user_id: caller.id");
    expect(source).toContain("professionalProfile");
  });

  it("does not keep an Onboarding browser mutation exception for professionals", () => {
    const policy = JSON.parse(readText("docs/governance/sensitive-mutation-boundaries.json")) as {
      allowedBrowserMutations: Array<{ file: string; table: string; operations: string[] }>;
    };

    const entries = policy.allowedBrowserMutations.filter((entry) =>
      entry.file === "src/pages/Onboarding.tsx" && entry.table === "professionals"
    );

    expect(entries).toEqual([]);
  });
});
