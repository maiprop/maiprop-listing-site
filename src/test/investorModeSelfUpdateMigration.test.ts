import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260604094000_block_investor_mode_self_update.sql"),
  "utf8",
);

describe("investor mode self-update migration", () => {
  it("removes authenticated profile update rights for investor_mode", () => {
    expect(migration).toContain("REVOKE UPDATE ON TABLE public.profiles FROM authenticated");
    expect(migration).not.toContain("investor_mode,\n  last_name");
    expect(migration).toContain("authenticated must not update public.profiles.investor_mode");
  });
});
