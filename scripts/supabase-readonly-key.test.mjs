import { describe, expect, it } from "vitest";

import { getSupabaseReadOnlyKey } from "./supabase-readonly-key.mjs";

function jwtForRole(role) {
  const payload = Buffer.from(JSON.stringify({ role })).toString("base64url");
  return `header.${payload}.signature`;
}

describe("getSupabaseReadOnlyKey", () => {
  it("accepts the current publishable-key format", () => {
    expect(
      getSupabaseReadOnlyKey({
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_live_catalogue_read",
      }),
    ).toBe("sb_publishable_live_catalogue_read");
  });

  it("accepts a legacy anon JWT", () => {
    const key = jwtForRole("anon");
    expect(getSupabaseReadOnlyKey({ SUPABASE_ANON_KEY: key })).toBe(key);
  });

  it("rejects a service-role key even when it is placed in a public variable", () => {
    expect(() =>
      getSupabaseReadOnlyKey({
        VITE_SUPABASE_PUBLISHABLE_KEY: jwtForRole("service_role"),
      }),
    ).toThrow(/read-only Supabase publishable or anon key/i);
  });

  it("rejects Supabase secret keys and missing configuration", () => {
    expect(() =>
      getSupabaseReadOnlyKey({
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_not_read_only",
      }),
    ).toThrow(/read-only Supabase publishable or anon key/i);
    expect(() => getSupabaseReadOnlyKey({})).toThrow(
      /read-only Supabase publishable or anon key/i,
    );
  });
});
