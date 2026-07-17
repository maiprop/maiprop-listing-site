import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("remaining audit hardening migrations", () => {
  it("delivers messages and attachment metadata atomically and idempotently", () => {
    const migration = read(
      "supabase/migrations/20260716200004_harden_message_delivery_transaction.sql",
    );

    expect(migration).toContain("private.send_message_with_attachments_for_actor");
    expect(migration).toContain("public.send_message_with_attachments");
    expect(migration).toContain("SECURITY INVOKER");
    expect(migration).toContain("client_delivery_id");
    expect(migration).toContain("message_delivery_id_conflict");
    expect(migration).toContain("duplicate_message_attachment");
    expect(migration).toContain("v_existing_attachments IS DISTINCT FROM v_requested_attachments");
    expect(migration).toContain("INSERT INTO public.message_attachments");
    expect(migration).toContain("conversation.closed_at IS NULL");
    expect(migration).toContain("REVOKE INSERT (");
  });

  it("keeps promotions paid-source scoped and preserves owner audit evidence", () => {
    const migration = read(
      "supabase/migrations/20260716200005_close_entitlement_promotion_audit_gaps.sql",
    );

    expect(migration).toContain("status = 'active'");
    expect(migration).toContain("current_billing_runtime_mode()");
    expect(migration).toContain("owner_snapshot");
    expect(migration).toContain("ON DELETE SET NULL");
    expect(migration).toContain("DROP TRIGGER IF EXISTS trg_check_valuation_monthly_limit");
    expect(migration).toContain("DROP TRIGGER IF EXISTS trg_check_report_monthly_limit");
    expect(migration).toContain("DROP TRIGGER IF EXISTS trg_check_priority_ad_monthly_limit");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.get_valuation_monthly_limit(uuid)",
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.get_report_monthly_limit(uuid)",
    );
  });
});
