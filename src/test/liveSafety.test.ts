import { afterEach, describe, expect, it } from "vitest";
import { canRunDestructiveLiveE2E, getSupabaseProjectRef } from "../../e2e/helpers/liveSafety";

const originalEnv = { ...process.env };

describe("destructive E2E live-safety guard", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("extracts Supabase project refs from project URLs", () => {
    expect(getSupabaseProjectRef("https://abcdefghijklmnopqrst.supabase.co")).toBe("abcdefghijklmnopqrst");
    expect(getSupabaseProjectRef("https://example.com")).toBeNull();
  });

  it("requires an explicit allowlist even when destructive tests are enabled", () => {
    process.env.E2E_ALLOW_DESTRUCTIVE_LIVE_TESTS = "true";
    process.env.VITE_SUPABASE_URL = "https://abcdefghijklmnopqrst.supabase.co";
    delete process.env.E2E_ALLOWED_DESTRUCTIVE_PROJECT_REFS;

    expect(canRunDestructiveLiveE2E()).toEqual({
      ok: false,
      reason: "E2E_ALLOWED_DESTRUCTIVE_PROJECT_REFS must explicitly name the isolated destructive-test Supabase project.",
    });
  });

  it("rejects known production even when it appears in the allowlist", () => {
    process.env.E2E_ALLOW_DESTRUCTIVE_LIVE_TESTS = "true";
    process.env.VITE_SUPABASE_URL = "https://qvvicunqcrwpioqnvzxf.supabase.co";
    process.env.E2E_ALLOWED_DESTRUCTIVE_PROJECT_REFS = "qvvicunqcrwpioqnvzxf";

    const decision = canRunDestructiveLiveE2E();
    expect(decision.ok).toBe(false);
    expect(decision.reason).toContain("known production");
  });

  it("allows only explicitly allowlisted non-production projects", () => {
    process.env.E2E_ALLOW_DESTRUCTIVE_LIVE_TESTS = "true";
    process.env.VITE_SUPABASE_URL = "https://abcdefghijklmnopqrst.supabase.co";
    process.env.E2E_ALLOWED_DESTRUCTIVE_PROJECT_REFS = "abcdefghijklmnopqrst";

    expect(canRunDestructiveLiveE2E()).toEqual({
      ok: true,
      reason: "Destructive E2E explicitly enabled for this project.",
    });
  });
});
