import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260707161000_fix_investor_feed_select_policy.sql"),
  "utf8",
);

describe("investor feed select policy migration", () => {
  it("keeps the sanitized investor feed readable to approved investor profiles", () => {
    expect(migration).toContain("GRANT SELECT ON TABLE public.firesale_requests_investor_feed TO authenticated");
    expect(migration).toContain('CREATE POLICY "firesale_feed_select"');
    expect(migration).toContain("p.role::text IN ('investor', 'institutional')");
    expect(migration).toContain("p.participant_type::text IN ('investor', 'institutional')");
    expect(migration).toContain("s.status IN ('active', 'trial')");
    expect(migration).toContain("public.has_platform_admin((SELECT auth.uid()))");
  });
});
