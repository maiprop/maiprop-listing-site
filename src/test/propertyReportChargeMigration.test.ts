import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260630123000_idempotent_property_report_charges.sql"),
  "utf8",
);

const fetchReportFunction = readFileSync(
  join(process.cwd(), "supabase/functions/fetch-report-from-os/index.ts"),
  "utf8",
);

describe("property report charge idempotency", () => {
  it("serializes cached report charges in Postgres before inserting usage rows", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.charge_property_report_fetch_for_user");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("usage_property_reports");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.charge_property_report_fetch_for_user");
    expect(migration).toContain("TO service_role");
    expect(fetchReportFunction).toContain("charge_property_report_fetch_for_user");
    expect(fetchReportFunction).not.toContain(".gte(\"created_at\", cacheGeneratedAt)");
  });
});
