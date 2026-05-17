import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260514150000_firesale_interest_reservation_workflow.sql"),
  "utf8",
);

describe("firesale reservation hardening migration", () => {
  it("serializes active hold checks per deal", () => {
    expect(migration).toContain("pg_advisory_xact_lock(hashtext(NEW.deal_id::text))");
    expect(migration).toContain("v_active_hold_statuses CONSTANT TEXT[]");
  });

  it("treats reserved, engaged, and won as exclusive active holds", () => {
    expect(migration).toContain("ARRAY['reserved', 'engaged', 'won']");
    expect(migration).toContain("status IN ('engaged', 'won')");
    expect(migration).toContain("active_reservation_exists_for_deal");
  });

  it("allows expiration cleanup only through a trusted system context", () => {
    expect(migration).toContain("maiprop.firesale_system_cleanup");
    expect(migration).toContain("invalid_system_cleanup_transition");
    expect(migration).toContain("OLD.status IS DISTINCT FROM 'reserved'");
    expect(migration).toContain("NEW.status IS DISTINCT FROM 'expired'");
  });

  it("explicitly revokes public access before granting security definer RPCs", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.release_expired_firesale_reservations(UUID) FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.admin_update_firesale_interest_workflow(UUID, TEXT, INTEGER, BOOLEAN, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.release_expired_firesale_reservations(UUID) TO authenticated, service_role",
    );
  });

  it("classifies reserved hold extensions by expiration changes", () => {
    expect(migration).toContain("NEW.status = 'reserved'");
    expect(migration).toContain("OLD.status = 'reserved'");
    expect(migration).toContain("NEW.reservation_expires_at IS DISTINCT FROM OLD.reservation_expires_at");
    expect(migration).toContain("reservation_extended");
  });

  it("documents rollback steps for triggers and workflow functions", () => {
    expect(migration).toContain("Rollback notes:");
    expect(migration).toContain("DROP TRIGGER IF EXISTS trg_guard_firesale_interest_mutation");
    expect(migration).toContain("DROP FUNCTION IF EXISTS public.admin_update_firesale_interest_workflow");
  });
});
