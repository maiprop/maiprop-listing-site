/**
 * Structured audit logger for sensitive edge-function operations.
 *
 * Writes to the `public.admin_audit_log` table created in migration
 * 20260418120000_admin_audit_log.sql. Every sensitive mutation (payment,
 * account deletion, role change performed outside the trg_user_roles_audit
 * trigger, data export, etc.) SHOULD call this helper so a tamper-evident
 * trail exists even for changes that don't map to a single table write.
 *
 * The function uses the service-role key, which bypasses RLS — reads are
 * still restricted to platform admins via the policy on admin_audit_log.
 *
 * Usage (inside any edge function):
 *
 *   import { logAuditEvent } from "../_shared/auditLog.ts";
 *
 *   await logAuditEvent({
 *     actor_id:  userId,
 *     target_id: targetUserId,
 *     entity:    "stripe.checkout.session",
 *     action:    "CREATED",
 *     new_data:  { session_id, product_id, amount_cents },
 *     reason:    "user initiated upgrade to Pro",
 *   });
 *
 * Failures are swallowed — audit logging must never break the user-facing
 * operation. Failures are logged to stdout so they surface in Supabase logs.
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";

export interface AuditEvent {
  actor_id?: string | null;
  target_id?: string | null;
  entity: string;
  action: "CREATED" | "UPDATED" | "DELETED" | "EXPORTED" | "DENIED" | string;
  old_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
  reason?: string | null;
}

let _client: ReturnType<typeof createClient> | null = null;

function getClient(): ReturnType<typeof createClient> | null {
  if (_client) return _client;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

export async function logAuditEvent(event: AuditEvent): Promise<void> {
  const client = getClient();
  if (!client) {
    console.warn("[auditLog] Supabase env missing — skipping audit write", {
      entity: event.entity,
      action: event.action,
    });
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (client as any).from("admin_audit_log").insert({
      actor_id: event.actor_id ?? null,
      target_id: event.target_id ?? null,
      entity: event.entity,
      action: event.action,
      old_data: event.old_data ?? null,
      new_data: event.new_data ?? null,
      reason: event.reason ?? null,
    });
    if (error) {
      console.error("[auditLog] insert failed", { entity: event.entity, error: error.message });
    }
  } catch (err) {
    // Never throw — the calling edge function's primary work must succeed.
    console.error("[auditLog] exception", err instanceof Error ? err.message : err);
  }
}
