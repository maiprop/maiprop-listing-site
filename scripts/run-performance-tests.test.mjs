import { describe, expect, it } from "vitest";

import { buildPerformanceEnvironment } from "./run-performance-tests.mjs";

describe("buildPerformanceEnvironment", () => {
  it("provides non-secret Supabase defaults for a clean local performance build", () => {
    const env = buildPerformanceEnvironment({});

    expect(env.VITE_SUPABASE_URL).toBe("https://abcdefghijklmnopqrst.supabase.co");
    expect(env.VITE_SUPABASE_PUBLISHABLE_KEY).toBe(
      "sb_publishable_e2e_placeholder_not_real_000000000000",
    );
    expect(env.VITE_SUPABASE_ANON_KEY).toBe(env.VITE_SUPABASE_PUBLISHABLE_KEY);
    expect(env.MAIPROP_RUNNING_PERF_GATE).toBe("1");
  });

  it("preserves explicitly configured project values", () => {
    const env = buildPerformanceEnvironment({
      VITE_SUPABASE_URL: "https://realprojectref0000.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "configured-publishable-key",
      VITE_SUPABASE_ANON_KEY: "configured-anon-key",
    });

    expect(env.VITE_SUPABASE_URL).toBe("https://realprojectref0000.supabase.co");
    expect(env.VITE_SUPABASE_PUBLISHABLE_KEY).toBe("configured-publishable-key");
    expect(env.VITE_SUPABASE_ANON_KEY).toBe("configured-anon-key");
  });
});
