/**
 * Tests for log-role-switch edge function.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { authedReq, captureHandler, req } from "../_shared/testUtils.ts";

const operationId = "11111111-1111-4111-8111-111111111111";

const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
);

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
  assertEquals(
    res.headers.get("Access-Control-Allow-Origin"),
    "https://maiprop.co",
  );
});

Deno.test("missing auth returns 401 or 503", async () => {
  const res = await handler(req("POST", {
    operation_id: operationId,
    from_type: "buyer",
    to_type: "agent",
    cancel_subscription: true,
  }));
  assertEquals([401, 503].includes(res.status), true);
});

Deno.test("missing auth is rejected without consuming malformed JSON", async () => {
  const request = new Request(
    "https://functions.supabase.co/log-role-switch",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    },
  );

  const res = await handler(request);

  assertEquals(res.status, 401);
  assertEquals(request.bodyUsed, false);
});

Deno.test("fake Bearer returns 401 before business work", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = ((input: string | URL | Request) => {
    const request = input instanceof Request ? input : new Request(input);
    const url = new URL(request.url);
    calls.push(`${request.method} ${url.pathname}`);
    if (url.origin === "https://test.supabase.co" && url.pathname === "/auth/v1/user" && request.method === "GET") {
      return Promise.resolve(new Response(JSON.stringify({ message: "invalid token" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }));
    }
    throw new Error(`unexpected transport: ${request.method} ${url}`);
  }) as typeof fetch;
  try {
    const res = await handler(authedReq("POST", {
      operation_id: operationId,
      from_type: "buyer",
      to_type: "seller",
      cancel_subscription: true,
    }));
    assertEquals(res.status, 401);
    assertEquals(calls, ["GET /auth/v1/user"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("malformed role-switch bodies are rejected after auth but before RPC or Stripe work", async () => {
  const originalFetch = globalThis.fetch;
  let authCalls = 0;
  let businessCalls = 0;
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user")) authCalls += 1;
    else businessCalls += 1;
    return Promise.resolve(
      new Response(
        JSON.stringify({
          user: { id: "user-1", email: "user@test.local" },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      from_type: "buyer",
      to_type: "agent",
      switch_kind: "upgrade",
      had_active_sub: true,
      cancel_subscription: true,
      unexpected: true,
    }, {
      authorization: `Bearer ${crypto.randomUUID()}`,
      "x-forwarded-for": crypto.randomUUID(),
    }));
    assertEquals(res.status, 400);
    assertEquals(authCalls, 1);
    assertEquals(businessCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("role switch cancellation iterates core billable subscriptions without cancelling add-ons", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const billingSource = await Deno.readTextFile(
    new URL("./billing.ts", import.meta.url),
  );
  assertEquals(
    billingSource.includes("for (const subscription of subscriptions)"),
    true,
  );
  assertEquals(
    billingSource.includes("shouldSkipProfileEntitlementSync"),
    true,
  );
  assertEquals(source.includes("sub_cancelled_count"), true);
  assertEquals(billingSource.includes("billableSubs[0]"), false);
});

Deno.test("role switch records audit intent before Stripe mutation and finalizes the outcome", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const auditIndex = source.indexOf('"record_role_switch_audit_for_user"');
  const stripeMutationIndex = source.indexOf(
    "billingResult = await reconcileRoleSwitchBilling",
  );
  assertEquals(auditIndex >= 0, true);
  assertEquals(stripeMutationIndex > auditIndex, true);
  assertEquals(
    source.includes('"finalize_role_switch_audit_for_user"'),
    true,
  );
  assertEquals(source.includes("resolveAuthoritativeRoleSwitch"), true);
  assertEquals(source.includes("unknownRoleSwitchBillingResult"), true);
  assertEquals(source.includes("reconciliation_required: true"), true);
  assertEquals(source.includes("_to_type: toType,"), true);
  assertEquals(source.includes("Audit insert skipped"), false);
});

restore();
