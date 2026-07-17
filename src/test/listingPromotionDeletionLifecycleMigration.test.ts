import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrations = resolve(process.cwd(), "supabase/migrations");
const migrationName = readdirSync(migrations).find((name) =>
  /^\d{14}_preserve_deleted_listing_promotion_audit\.sql$/.test(name)
);
const migration = migrationName
  ? readFileSync(resolve(migrations, migrationName), "utf8")
  : "";

describe("listing promotion deletion lifecycle", () => {
  it("retains consumed promotion evidence instead of cascading it away", () => {
    expect(migrationName).toBeTruthy();
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS listing_snapshot jsonb");
    expect(migration).toContain("ALTER COLUMN listing_id DROP NOT NULL");
    expect(migration).toContain("ON DELETE SET NULL");
    expect(migration).toContain("status <> 'active' OR listing_id IS NOT NULL");
  });

  it("revokes active allocations and records a bounded listing snapshot", () => {
    expect(migration).toContain("private.preserve_deleted_listing_promotion_audit");
    expect(migration).toContain("BEFORE DELETE ON public.listings");
    expect(migration).toContain("listing_id = NULL");
    expect(migration).toContain("THEN 'revoked'");
    expect(migration).toContain("THEN 'listing_deleted'");
    expect(migration).toContain("'deleted_at', statement_timestamp()");
    expect(migration).not.toContain("to_jsonb(OLD)");
    expect(migration).not.toContain("OLD.currency");
  });
});
