import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260514185213_harden_open_house_registration_updates.sql",
);

describe("open-house registration mutation guard migration", () => {
  const migration = readFileSync(migrationPath, "utf8");

  it("blocks requester changes to host-controlled fields", () => {
    expect(migration).toContain("guard_open_house_registration_update");
    expect(migration).toContain("NEW.id_verified_at IS DISTINCT FROM OLD.id_verified_at");
    expect(migration).toContain("NEW.approved_by IS DISTINCT FROM OLD.approved_by");
    expect(migration).toContain("NEW.attended_at IS DISTINCT FROM OLD.attended_at");
    expect(migration).toContain("NEW.pof_verified_status IS DISTINCT FROM OLD.pof_verified_status");
    expect(migration).toContain("host_controlled_open_house_fields");
  });

  it("allows requesters to cancel but not self-approve or mark attendance", () => {
    expect(migration).toContain("NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'cancelled'");
    expect(migration).toContain("requester_can_only_cancel_registration");
    expect(migration).toContain("only_approved_registrations_can_be_attended");
  });

  it("splits requester RLS policies instead of using a broad FOR ALL policy", () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "oh_regs_requester"');
    expect(migration).toContain('CREATE POLICY "oh_regs_requester_select"');
    expect(migration).toContain('CREATE POLICY "oh_regs_requester_insert"');
    expect(migration).toContain('CREATE POLICY "oh_regs_requester_update"');
    expect(migration).not.toContain('CREATE POLICY "oh_regs_requester" ON public.open_house_registrations FOR ALL');
  });
});
