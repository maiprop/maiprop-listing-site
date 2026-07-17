import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260717084044_serialize_property_report_generation.sql",
  "utf8",
);
const repairMigration = readFileSync(
  "supabase/migrations/20260717130453_repair_property_report_generation_lease_boolean_return.sql",
  "utf8",
);

describe("property report generation lease migration", () => {
  it("serializes provider work behind a service-only expiring lease", () => {
    expect(migration).toContain("private.property_report_generation_leases");
    expect(migration).toContain("claim_property_report_generation");
    expect(migration).toContain("release_property_report_generation");
    expect(migration).toContain("lease_until");
    expect(migration).toContain("ON CONFLICT");
    expect(migration).toContain("GRANT EXECUTE");
    expect(migration).toContain("TO service_role");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).not.toContain("pg_catalog.coalesce");
    expect(repairMigration).toContain("RETURN COALESCE(v_claimed, false)");
    expect(repairMigration).toContain("RETURN COALESCE(v_released, false)");
  });
});
