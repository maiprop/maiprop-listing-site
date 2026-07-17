import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrations = resolve(process.cwd(), "supabase/migrations");
const migrationName = readdirSync(migrations).find((name) =>
  /^\d{14}_harden_investor_feed_grants\.sql$/.test(name)
);
const migration = migrationName
  ? readFileSync(resolve(migrations, migrationName), "utf8")
  : "";

describe("investor feed grants", () => {
  it("uses the granted private admin helper in the read policy", () => {
    expect(migration).toContain("DROP POLICY IF EXISTS firesale_feed_select");
    expect(migration).toContain("private.has_platform_admin((SELECT auth.uid()))");
    expect(migration).toContain("public.has_current_investor_subscription");
  });

  it("keeps the browser contract read-only", () => {
    expect(migrationName).toBeTruthy();
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("GRANT SELECT ON TABLE public.firesale_requests_investor_feed");
    expect(migration).toContain("authenticated role can mutate investor feed");
  });
});
