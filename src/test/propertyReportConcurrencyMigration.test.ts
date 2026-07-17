import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260716234353_harden_property_report_access_and_idempotency.sql",
  ),
  "utf8",
);

describe("property-report concurrency hardening migration", () => {
  it("serializes charges by stable user and listing identity", () => {
    expect(migration).toContain(
      "p_user_id::text || ':property-report:' || p_listing_id::text",
    );
    expect(migration).not.toContain(
      "p_cache_generated_at::text,\n        0",
    );
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.charge_property_report_fetch_for_user",
    );
  });

  it("keeps the billing boundary service-only", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.charge_property_report_fetch_for_user",
    );
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("TO service_role");
  });
});
