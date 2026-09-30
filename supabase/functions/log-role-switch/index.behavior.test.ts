import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const actorId = "22222222-2222-4222-8222-222222222222";
const operationId = "33333333-3333-4333-8333-333333333333";
const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");

type Scenario = "profile-missing" | "pricing-error" | "source-mismatch" | "audit-error" |
  "audit-mismatch" | "finalized" | "success" | "durable-error" | "ambiguous-replay" |
  "finalize-retry" | "finalize-failure";

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function runScenario(scenario: Scenario, requests = 1, finalizedOutcome: "succeeded" | "not_required" | "already_pending" = "succeeded") {
  const originalFetch = globalThis.fetch;
  const originalStripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const originalMode = Deno.env.get("STRIPE_RUNTIME_MODE");
  const originalLive = Deno.env.get("STRIPE_LIVE_MODE");
  const originalAccount = Deno.env.get("STRIPE_EXPECTED_ACCOUNT_ID");
  const calls: Array<{ method: string; path: string; query: string; idempotencyKey?: string; body?: Record<string, unknown> }> = [];
  let finalizations = 0;
  let cancellationAccepted = false;
  let auditOutcome = scenario === "finalized" ? finalizedOutcome : "pending";
  if (["success", "durable-error", "ambiguous-replay", "finalize-retry", "finalize-failure"].includes(scenario)) {
    Deno.env.set("STRIPE_SECRET_KEY", `sk_test_e3_${crypto.randomUUID().replaceAll("-", "")}`);
    Deno.env.set("STRIPE_RUNTIME_MODE", "test");
    Deno.env.set("STRIPE_LIVE_MODE", "false");
    Deno.env.set("STRIPE_EXPECTED_ACCOUNT_ID", "acct_e3log");
  }
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const body = request.method === "POST" ? await request.clone().json().catch(() => undefined) as Record<string, unknown> | undefined : undefined;
    calls.push({ method: request.method, path: url.pathname, query: url.search,
      ...(request.headers.get("idempotency-key") ? { idempotencyKey: request.headers.get("idempotency-key")! } : {}),
      ...(body ? { body } : {}) });
    if (url.origin === "https://api.stripe.com") {
      if (url.pathname === "/v1/account" && request.method === "GET") return json({ id: "acct_e3log" });
      if (url.pathname === "/v1/balance" && request.method === "GET") return json({ livemode: false });
      if (url.pathname === "/v1/customers/search" && request.method === "GET") {
        return json({ data: scenario === "success" || scenario === "ambiguous-replay" ? [{ id: "cus_e3owned" }] : [] });
      }
      if (url.pathname === "/v1/subscriptions" && request.method === "GET") {
        return json({ data: [{ id: "sub_e3core", status: "active", cancel_at_period_end: cancellationAccepted, metadata: {} }], has_more: false });
      }
      if (url.pathname === "/v1/subscriptions/sub_e3core" && request.method === "POST") {
        cancellationAccepted = true;
        if (scenario === "ambiguous-replay") return json({ error: { message: "response unavailable" } }, 500);
        return json({ id: "sub_e3core", cancel_at_period_end: true });
      }
    }
    if (url.origin !== "https://test.supabase.co") throw new Error(`unexpected provider transport: ${request.method} ${url}`);
    if (url.pathname === "/auth/v1/user" && request.method === "GET") {
      return json({ user: { id: actorId, email: "actor@example.test" } });
    }
    if (url.pathname === "/rest/v1/profiles" && request.method === "GET") {
      return json(scenario === "profile-missing" ? null : {
        role: scenario === "source-mismatch" ? "agent" : "buyer",
        participant_type: scenario === "source-mismatch" ? "agent" : "buyer",
        role_switch_in_progress_at: null,
        role_switch_audit_id: null,
      });
    }
    if (url.pathname === "/rest/v1/pricing_configs" && request.method === "GET") {
      return scenario === "pricing-error" ? json({ message: "prices unavailable" }, 500) : json([{ key: "pro", amount: 20 }]);
    }
    if (url.pathname === "/rest/v1/billing_customers" && request.method === "GET") {
      return scenario === "durable-error" || scenario === "finalize-retry" || scenario === "finalize-failure"
        ? json({ message: "durable lookup unavailable" }, 500)
        : json([]);
    }
    if (url.pathname.endsWith("/record_role_switch_audit_for_user") && request.method === "POST") {
      if (scenario === "audit-error") return json({ message: "intent rejected" }, 400);
      return json(scenario === "audit-mismatch" ? "44444444-4444-4444-8444-444444444444" : operationId);
    }
    if (url.pathname === "/rest/v1/role_switch_history" && request.method === "GET") {
      return json({
        billing_outcome: auditOutcome,
        billing_reconciliation_required: auditOutcome === "pending" || auditOutcome === "unknown",
        billing_subscription_count: scenario === "finalized" ? (auditOutcome === "not_required" ? 0 : 2) : null,
        billing_cancelled_count: scenario === "finalized" ? (auditOutcome === "not_required" ? 0 : 1) : null,
        had_active_sub: scenario === "finalized" ? auditOutcome !== "not_required" : null,
        sub_cancelled: scenario === "finalized" && auditOutcome !== "not_required",
      });
    }
    if (url.pathname.endsWith("/finalize_role_switch_audit_for_user") && request.method === "POST") {
      finalizations += 1;
      if (scenario === "finalize-failure" || (scenario === "finalize-retry" && finalizations === 1)) {
        return json({ message: "settlement unavailable" }, 500);
      }
      auditOutcome = String(body?._billing_outcome);
      return json(null);
    }
    throw new Error(`unexpected transport: ${request.method} ${url.pathname}`);
  }) as typeof fetch;
  try {
    const responses: Array<{ status: number; body: Record<string, unknown> }> = [];
    for (let index = 0; index < requests; index += 1) {
      const response = await handler(req("POST", {
        operation_id: operationId,
        from_type: "buyer",
        to_type: "seller",
        cancel_subscription: true,
      }, {
        authorization: "Bearer test-token",
        "x-forwarded-for": crypto.randomUUID(),
      }));
      responses.push({ status: response.status, body: await response.json() as Record<string, unknown> });
    }
    return { calls, responses };
  } finally {
    globalThis.fetch = originalFetch;
    if (originalStripeKey === undefined) Deno.env.delete("STRIPE_SECRET_KEY");
    else Deno.env.set("STRIPE_SECRET_KEY", originalStripeKey);
    if (originalMode === undefined) Deno.env.delete("STRIPE_RUNTIME_MODE"); else Deno.env.set("STRIPE_RUNTIME_MODE", originalMode);
    if (originalLive === undefined) Deno.env.delete("STRIPE_LIVE_MODE"); else Deno.env.set("STRIPE_LIVE_MODE", originalLive);
    if (originalAccount === undefined) Deno.env.delete("STRIPE_EXPECTED_ACCOUNT_ID"); else Deno.env.set("STRIPE_EXPECTED_ACCOUNT_ID", originalAccount);
  }
}

Deno.test("role-switch profile, pricing, source and audit errors stop before billing", async () => {
  for (const [scenario, status] of [
    ["profile-missing", 400], ["pricing-error", 400], ["source-mismatch", 400],
    ["audit-error", 503], ["audit-mismatch", 503],
  ] as const) {
    const result = await runScenario(scenario);
    assertEquals(result.responses[0].status, status, scenario);
    assertEquals(result.calls.some((call) => call.path.includes("finalize_role_switch")), false);
    assertEquals(result.calls.some((call) => call.path.startsWith("/v1/")), false);
    const profile = result.calls.find((call) => call.path === "/rest/v1/profiles");
    assertEquals(profile?.query.includes(`user_id=eq.${actorId}`), true);
    const audit = result.calls.find((call) => call.path.endsWith("/record_role_switch_audit_for_user"));
    if (audit) assertEquals(audit.body?._user_id, actorId);
  }
});

Deno.test("finalized role-switch replay returns stored facts twice without billing or finalization", async () => {
  for (const outcome of ["succeeded", "not_required", "already_pending"] as const) {
    const result = await runScenario("finalized", 2, outcome);
    assertEquals(result.responses.map((response) => response.status), [200, 200]);
    for (const response of result.responses) {
      assertEquals(response.body.audit_id, operationId);
      assertEquals(response.body.billing_outcome, outcome);
      assertEquals(response.body.sub_cancelled_count, outcome === "not_required" ? 0 : 1);
      assertEquals(response.body.billing_subscription_count, outcome === "not_required" ? 0 : 2);
    }
    assertEquals(result.calls.filter((call) => call.path.endsWith("/record_role_switch_audit_for_user")).length, 2);
    assertEquals(result.calls.some((call) => call.path.includes("billing_customers") || call.path.includes("finalize_role_switch") || call.path.startsWith("/v1/")), false);
  }
});

Deno.test("durable customer lookup failure after intent finalizes unknown before returning 502", async () => {
  const result = await runScenario("durable-error");
  assertEquals(result.responses[0].status, 502);
  assertEquals(result.responses[0].body.audit_id, operationId);
  assertEquals(result.responses[0].body.billing_outcome, "unknown");
  assertEquals(result.responses[0].body.reconciliation_required, true);
  assertEquals(result.responses[0].body.sub_cancelled_count, undefined);
  const paths = result.calls.map((call) => call.path);
  assertEquals(paths.indexOf("/rest/v1/profiles") < paths.indexOf("/rest/v1/pricing_configs"), true);
  assertEquals(paths.indexOf("/rest/v1/pricing_configs") < paths.indexOf("/rest/v1/rpc/record_role_switch_audit_for_user"), true);
  const finalization = result.calls.find((call) => call.path.endsWith("/finalize_role_switch_audit_for_user"));
  assertEquals(finalization?.body?._audit_id, operationId);
  assertEquals(finalization?.body?._user_id, actorId);
  assertEquals(finalization?.body?._billing_outcome, "unknown");
  assertEquals(finalization?.body?._billing_error, "customer_resolution_failed");
  assertEquals(finalization?.body?._cancelled_count, null);
  assertEquals(result.calls.some((call) => call.path === "/v1/subscriptions/sub_e3core"), false);
});

Deno.test("admitted role switch cancels one owned core subscription after audit intent and records exact result", async () => {
  const result = await runScenario("success");
  assertEquals(result.responses[0].status, 200);
  assertEquals(result.responses[0].body.billing_outcome, "succeeded");
  assertEquals(result.responses[0].body.sub_cancelled_count, 1);
  assertEquals(result.responses[0].body.billing_subscription_count, 1);
  const paths = result.calls.map((call) => call.path);
  assertEquals(paths.indexOf("/rest/v1/rpc/record_role_switch_audit_for_user") < paths.indexOf("/v1/subscriptions/sub_e3core"), true);
  const update = result.calls.find((call) => call.path === "/v1/subscriptions/sub_e3core");
  assertEquals(update?.method, "POST");
  assertEquals(update?.idempotencyKey, `role-switch:${operationId}:sub_e3core`);
  const search = result.calls.find((call) => call.path === "/v1/customers/search");
  assertEquals(new URLSearchParams(search?.query).get("query"), `metadata['user_id']:'${actorId}'`);
  const finalization = result.calls.find((call) => call.path.endsWith("/finalize_role_switch_audit_for_user"));
  assertEquals(finalization?.body?._billing_outcome, "succeeded");
  assertEquals(finalization?.body?._subscription_count, 1);
  assertEquals(finalization?.body?._cancelled_count, 1);
});

Deno.test("lost cancellation response replays against already-pending provider state without a second mutation", async () => {
  const result = await runScenario("ambiguous-replay", 2);
  assertEquals(result.responses.map((response) => response.status), [502, 200]);
  assertEquals(result.responses.map((response) => response.body.audit_id), [operationId, operationId]);
  assertEquals(result.responses.map((response) => response.body.billing_outcome), ["unknown", "already_pending"]);
  assertEquals(result.responses[0].body.reconciliation_required, true);
  assertEquals(result.responses[0].body.sub_cancelled_count, undefined);
  assertEquals(result.responses[1].body.sub_cancelled_count, 0);
  assertEquals(result.responses[1].body.sub_already_cancelling_count, 1);
  const mutations = result.calls.filter((call) => call.path === "/v1/subscriptions/sub_e3core" && call.method === "POST");
  assertEquals(mutations.length, 1);
  assertEquals(mutations[0].idempotencyKey, `role-switch:${operationId}:sub_e3core`);
  const settlements = result.calls.filter((call) => call.path.endsWith("/finalize_role_switch_audit_for_user"));
  assertEquals(settlements.map((call) => call.body?._billing_outcome), ["unknown", "already_pending"]);
  assertEquals(settlements.map((call) => call.body?._audit_id), [operationId, operationId]);
});

Deno.test("role-switch retries finalization once and exposes unresolved audit after both attempts fail", async () => {
  const retry = await runScenario("finalize-retry");
  assertEquals(retry.responses[0].status, 502);
  assertEquals(retry.responses[0].body, { error: "Billing cancellation could not be verified", audit_id: operationId, billing_outcome: "unknown", reconciliation_required: true, stripe_error: "billing_verification_failed" });
  const retrySettlements = retry.calls.filter((call) => call.path.endsWith("/finalize_role_switch_audit_for_user"));
  assertEquals(retrySettlements.length, 2);
  assertEquals(retrySettlements.map((call) => call.body?._billing_outcome), ["unknown", "unknown"]);
  assertEquals(retrySettlements.map((call) => call.body?._billing_error), ["customer_resolution_failed", "customer_resolution_failed"]);
  assertEquals(retrySettlements.map((call) => call.body?._audit_id), [operationId, operationId]);
  const failure = await runScenario("finalize-failure");
  assertEquals(failure.responses[0].status, 500);
  assertEquals(failure.responses[0].body.audit_id, operationId);
  assertEquals(failure.responses[0].body.reconciliation_required, true);
  assertEquals(failure.calls.filter((call) => call.path.endsWith("/finalize_role_switch_audit_for_user")).length, 2);
});

restore();
