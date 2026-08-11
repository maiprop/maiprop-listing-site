import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SchemaValidationError } from "../_shared/schema.ts";
import {
  canonicalRoleSwitchKind,
  parseRoleSwitchRequest,
  resolveAuthoritativeRoleSwitch,
} from "./request.ts";

const operationId = "11111111-1111-4111-8111-111111111111";
const maxRequestBodyBytes = 8_192;

function request(body: unknown): Request {
  return new Request("https://functions.supabase.co/log-role-switch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function stalledRequest(): { request: Request; wasCancelled: () => boolean } {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull: () => new Promise<void>(() => undefined),
    cancel: () => {
      cancelled = true;
    },
  });
  return {
    request: new Request("https://functions.supabase.co/log-role-switch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
    wasCancelled: () => cancelled,
  };
}

Deno.test("role switch accepts destination binding and cancellation preflight contracts", async () => {
  assertEquals(
    await parseRoleSwitchRequest(request({
      operation_id: operationId,
      from_type: "buyer",
      to_type: "agent",
      cancel_subscription: true,
    })),
    {
      operation_id: operationId,
      from_type: "buyer",
      to_type: "agent",
      cancel_subscription: true,
    },
  );

  assertEquals(
    await parseRoleSwitchRequest(request({
      operation_id: operationId,
      from_type: "agent",
      to_type: "",
      cancel_subscription: true,
    })),
    {
      operation_id: operationId,
      from_type: "agent",
      to_type: "",
      cancel_subscription: true,
    },
  );
});

Deno.test("role switch rejects invalid identities and client-authored audit facts", async () => {
  const base = {
    operation_id: operationId,
    from_type: "buyer",
    to_type: "seller",
    cancel_subscription: true,
  };
  for (
    const body of [
      { ...base, operation_id: "not-a-uuid" },
      { ...base, from_type: "admin" },
      { ...base, to_type: "root" },
      { ...base, cancel_subscription: false },
      { ...base, switch_kind: "same-tier" },
      { ...base, had_active_sub: false },
      { ...base, action: "cancel-all" },
    ]
  ) {
    await assertRejects(
      () => parseRoleSwitchRequest(request(body)),
      SchemaValidationError,
    );
  }
});

Deno.test("role switch rejects declared oversized bodies without consuming them", async () => {
  const req = request({});
  req.headers.set("content-length", String(maxRequestBodyBytes + 1));

  const error = await assertRejects(
    () => parseRoleSwitchRequest(req),
    SchemaValidationError,
  );
  assertEquals(error.code, "payload_too_large");
  assertEquals(req.bodyUsed, false);
});

Deno.test("role switch times out and cancels a stalled request body", async () => {
  const stalled = stalledRequest();
  const parseWithTestDeadline = parseRoleSwitchRequest as unknown as (
    req: Request,
    options: { timeoutMs: number },
  ) => Promise<unknown>;
  let ceilingTimer: ReturnType<typeof setTimeout> | undefined;
  const outcome = await Promise.race([
    parseWithTestDeadline(stalled.request, { timeoutMs: 10 }).then(
      () => ({ kind: "resolved" as const }),
      (error: unknown) => ({ kind: "rejected" as const, error }),
    ),
    new Promise<{ kind: "ceiling" }>((resolve) => {
      ceilingTimer = setTimeout(() => resolve({ kind: "ceiling" }), 100);
    }),
  ]);
  if (ceilingTimer !== undefined) clearTimeout(ceilingTimer);

  assertEquals(outcome.kind, "rejected");
  if (outcome.kind === "rejected") {
    assertEquals(outcome.error instanceof SchemaValidationError, true);
    assertEquals(
      (outcome.error as SchemaValidationError).code,
      "request_timeout",
    );
    assertEquals((outcome.error as SchemaValidationError).status, 408);
  }
  assertEquals(stalled.wasCancelled(), true);
});

Deno.test("role switch derives kind from authoritative runtime prices", () => {
  const prices = {
    buyer: 29,
    seller: 29,
    agent: 149,
    developer: 129,
    professional: 69,
  };
  assertEquals(canonicalRoleSwitchKind("buyer", "seller", prices), "same-tier");
  assertEquals(canonicalRoleSwitchKind("buyer", "agent", prices), "upgrade");
  assertEquals(
    canonicalRoleSwitchKind("agent", "professional", prices),
    "downgrade",
  );
  assertEquals(
    canonicalRoleSwitchKind("buyer", "developer", prices),
    "proonly",
  );
  assertEquals(
    canonicalRoleSwitchKind("buyer", "investor", prices),
    "invite-only",
  );

  assertEquals(
    resolveAuthoritativeRoleSwitch(
      {
        operation_id: operationId,
        from_type: "agent",
        to_type: "professional",
        cancel_subscription: true,
      },
      {
        role: "agent",
        participant_type: null,
        role_switch_in_progress_at: "2026-08-05T12:00:00.000Z",
        role_switch_audit_id: operationId,
      },
      prices,
    ),
    {
      operationId,
      fromType: "agent",
      toType: "professional",
      switchKind: "downgrade",
    },
  );
});

Deno.test("role switch rejects source, audit, and pricing mismatches", () => {
  const profile = {
    role: "agent",
    participant_type: null,
    role_switch_in_progress_at: "2026-08-05T12:00:00.000Z",
    role_switch_audit_id: operationId,
  };

  assertThrows(
    () =>
      resolveAuthoritativeRoleSwitch(
        {
          operation_id: operationId,
          from_type: "buyer",
          to_type: "seller",
          cancel_subscription: true,
        },
        profile,
        { buyer: 29, seller: 29 },
      ),
    SchemaValidationError,
  );

  assertThrows(
    () =>
      resolveAuthoritativeRoleSwitch(
        {
          operation_id: "22222222-2222-4222-8222-222222222222",
          from_type: "agent",
          to_type: "professional",
          cancel_subscription: true,
        },
        profile,
        { agent: 149, professional: 69 },
      ),
    SchemaValidationError,
  );

  assertThrows(
    () =>
      resolveAuthoritativeRoleSwitch(
        {
          operation_id: operationId,
          from_type: "agent",
          to_type: "professional",
          cancel_subscription: true,
        },
        profile,
        { agent: 149 },
      ),
    SchemaValidationError,
  );
});
