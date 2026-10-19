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
    const bridge = readText("supabase/migrations/20260927013928_restore_role_switch_compatibility_bridge.sql");

    expect(source).toContain('verifyBearerToken');
    expect(source).toContain('"complete_onboarding_role_with_profile_for_user"');
    expect(source).toContain("p_user_id: caller.id");
    expect(source).toContain("p_professional_profile: payload.professionalProfile ?? null");
    expect(bridge).toContain("INSERT INTO public.professionals(user_id,title,category,display_name,city,license_number)");
    expect(bridge).toContain("ON CONFLICT(user_id) DO UPDATE");
    expect(bridge).toContain("RETURN private.complete_onboarding_role_transaction(p_user_id,p_role,p_participant_type,p_display_name,p_city,p_phone,p_professional_profile)");
    expect(bridge).toContain("TO service_role;");
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
