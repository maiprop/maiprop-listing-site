import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260629142217_optimize_firesale_reservation_expiry.sql"),
  "utf8",
);

describe("firesale reservation expiry optimization migration", () => {
  it("bounds the cron-backed expiry sweep and keeps it service-only", () => {
    expect(migration).toContain("idx_firesale_interest_reserved_expiry");
    expect(migration).toContain("pg_try_advisory_xact_lock");
    expect(migration).toContain("LIMIT v_batch_size");
    expect(migration).toContain("FOR UPDATE SKIP LOCKED");
    expect(migration).toContain("'*/15 * * * *'");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.release_expired_firesale_reservations(UUID)");
    expect(migration).not.toContain("TO authenticated, service_role");
  });
});
