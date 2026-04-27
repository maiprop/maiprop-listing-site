/**
 * Deno unit tests for the shared audit log helper.
 * Run: deno test supabase/functions/_shared/auditLog.test.ts
 *
 * These tests verify the module's defensive behaviour without requiring
 * a live Supabase connection — the service-role env vars are intentionally
 * unset so the client factory returns null.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { logAuditEvent } from "./auditLog.ts";
import type { AuditEvent } from "./auditLog.ts";

Deno.test("logAuditEvent: no-ops gracefully when Supabase env is missing", async () => {
  const prevUrl = Deno.env.get("SUPABASE_URL");
  const prevKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  Deno.env.delete("SUPABASE_URL");
  Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");

  try {
    // Should complete without throwing
    await logAuditEvent({
      entity: "test.entity",
      action: "CREATED",
      actor_id: "user-123",
      new_data: { foo: "bar" },
    });
  } finally {
    if (prevUrl) Deno.env.set("SUPABASE_URL", prevUrl);
    if (prevKey) Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", prevKey);
  }
});

Deno.test("AuditEvent interface: allows all documented action values", () => {
  const events: AuditEvent[] = [
    { entity: "user", action: "CREATED" },
    { entity: "user", action: "UPDATED" },
    { entity: "user", action: "DELETED" },
    { entity: "data", action: "EXPORTED" },
    { entity: "auth", action: "DENIED" },
    { entity: "custom", action: "custom-action" },
  ];
  assertEquals(events.length, 6);
});

Deno.test("AuditEvent interface: all fields are optional except entity and action", () => {
  const minimal: AuditEvent = { entity: "test", action: "CREATED" };
  assertEquals(minimal.actor_id, undefined);
  assertEquals(minimal.target_id, undefined);
  assertEquals(minimal.old_data, undefined);
  assertEquals(minimal.new_data, undefined);
  assertEquals(minimal.reason, undefined);
});
