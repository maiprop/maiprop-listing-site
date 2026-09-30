import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const cronSecret = crypto.randomUUID();
const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
  {
    CRON_SECRET: cronSecret,
    STRIPE_SECRET_KEY: "invalid-runtime-key",
  },
);

Deno.test("role-switch reconciliation accepts POST only", async () => {
  const response = await handler(
    new Request("https://functions.supabase.co/fn", {
      method: "GET",
      headers: { "x-cron-secret": cronSecret },
    }),
  );
  assertEquals(response.status, 405);
});

Deno.test("role-switch reconciliation rejects missing and incorrect cron secrets", async () => {
  const missing = await handler(req("POST"));
  const incorrect = await handler(
    req("POST", {}, { "x-cron-secret": "wrong" }),
  );
  assertEquals(missing.status, 401);
  assertEquals(incorrect.status, 401);
});

Deno.test("role-switch reconciliation fails closed when Stripe runtime is not explicit", async () => {
  const response = await handler(
    req("POST", {}, { "x-cron-secret": cronSecret }),
  );
  assertEquals(response.status, 503);
});

type Scenario = "empty" | "success" | "billing-error" | "deadline" | "release-error" |
  "claim-error" | "missing-user" | "complete-error" | "account-error";

async function runScenario(scenario: Scenario) {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const originalKey = Deno.env.get("STRIPE_SECRET_KEY");
  const originalMode = Deno.env.get("STRIPE_RUNTIME_MODE");
  const originalLive = Deno.env.get("STRIPE_LIVE_MODE");
  const originalAccount = Deno.env.get("STRIPE_EXPECTED_ACCOUNT_ID");
  const calls: Array<{ method: string; path: string; query: string; body?: Record<string, unknown> }> = [];
  let fireWorkDeadline: (() => void) | undefined;
  const claim = {
    audit_id: "11111111-1111-4111-8111-111111111111",
    user_id: "22222222-2222-4222-8222-222222222222",
    lock_token: "33333333-3333-4333-8333-333333333333",
    attempt_count: 1,
  };
  Deno.env.set("STRIPE_SECRET_KEY", `sk_test_e3_${crypto.randomUUID().replaceAll("-", "")}`);
  Deno.env.set("STRIPE_RUNTIME_MODE", "test");
  Deno.env.set("STRIPE_LIVE_MODE", "false");
  Deno.env.set("STRIPE_EXPECTED_ACCOUNT_ID", "acct_e3reconcile");
  if (scenario === "deadline" || scenario === "release-error") {
    globalThis.setTimeout = ((callback: () => void, delay?: number) => {
      if (delay === 42_000) fireWorkDeadline = callback;
      return originalSetTimeout(callback, delay);
    }) as typeof setTimeout;
  }
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const body = request.method === "POST" ? await request.clone().json().catch(() => undefined) as Record<string, unknown> | undefined : undefined;
    calls.push({ method: request.method, path: url.pathname, query: url.search, ...(body ? { body } : {}) });
    if (url.origin === "https://api.stripe.com") {
      if (url.pathname === "/v1/account" && request.method === "GET") {
        return scenario === "account-error" ? json({ error: { message: "account unavailable" } }, 500) : json({ id: "acct_e3reconcile" });
      }
      if (url.pathname === "/v1/balance" && request.method === "GET") return json({ livemode: false });
      if (url.pathname === "/v1/customers/search" && request.method === "GET") {
        return scenario === "billing-error" ? json({ error: { message: "search ambiguous" } }, 500) : json({ data: [] });
      }
      if (url.pathname === "/v1/subscriptions" && request.method === "GET") return json({ data: [], has_more: false });
    }
    if (url.origin === "https://test.supabase.co") {
      if (url.pathname.endsWith("/claim_role_switch_reconciliation_batch") && request.method === "POST") {
        return scenario === "claim-error" ? json({ message: "claim unavailable" }, 500) : json(scenario === "empty" ? [] : [claim]);
      }
      if (url.pathname === `/auth/v1/admin/users/${claim.user_id}` && request.method === "GET") {
        if (scenario === "deadline" || scenario === "release-error") fireWorkDeadline?.();
        return json({ user: { id: claim.user_id, email: scenario === "missing-user" ? null : "actor@example.test" } });
      }
      if (url.pathname === "/rest/v1/billing_customers" && request.method === "GET") {
        return scenario === "billing-error" ? json({ message: "durable lookup unavailable" }, 500) : json([]);
      }
      if (url.pathname.endsWith("/complete_role_switch_reconciliation_attempt") && request.method === "POST") {
        return scenario === "complete-error" ? json({ message: "settlement unavailable" }, 500) : json(null);
      }
      if (url.pathname.endsWith("/release_role_switch_reconciliation_claims") && request.method === "POST") {
        return scenario === "release-error" ? json({ message: "release unavailable" }, 500) : json(null);
      }
    }
    throw new Error(`unexpected transport: ${request.method} ${url}`);
  }) as typeof fetch;
  try {
    const response = await handler(req("POST", {}, { "x-cron-secret": cronSecret }));
    return { calls, claim, status: response.status, contentType: response.headers.get("content-type"), body: await response.json() as Record<string, unknown> };
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    if (originalKey === undefined) Deno.env.delete("STRIPE_SECRET_KEY"); else Deno.env.set("STRIPE_SECRET_KEY", originalKey);
    if (originalMode === undefined) Deno.env.delete("STRIPE_RUNTIME_MODE"); else Deno.env.set("STRIPE_RUNTIME_MODE", originalMode);
    if (originalLive === undefined) Deno.env.delete("STRIPE_LIVE_MODE"); else Deno.env.set("STRIPE_LIVE_MODE", originalLive);
    if (originalAccount === undefined) Deno.env.delete("STRIPE_EXPECTED_ACCOUNT_ID"); else Deno.env.set("STRIPE_EXPECTED_ACCOUNT_ID", originalAccount);
  }
}

Deno.test("reconciliation empty claim returns zero counters after account verification without customer work", async () => {
  const result = await runScenario("empty");
  assertEquals(result.status, 200);
  assertEquals(result.body, { success: true, claimed: 0, completed: 0, retryable: 0, failed: 0, deferred: 0, deadlineReached: false });
  assertEquals(result.calls.map((call) => call.path), [
    "/v1/account", "/v1/balance", "/rest/v1/rpc/claim_role_switch_reconciliation_batch",
  ]);
});

Deno.test("reconciliation completes missing user as unknown and binds exact audit, user and lease", async () => {
  const result = await runScenario("missing-user");
  assertEquals(result.status, 200);
  assertEquals(result.body?.retryable, 1);
  assertEquals(result.body?.completed, 0);
  const completion = result.calls.find((call) => call.path.endsWith("/complete_role_switch_reconciliation_attempt"));
  assertEquals(completion?.body?._audit_id, result.claim.audit_id);
  assertEquals(completion?.body?._user_id, result.claim.user_id);
  assertEquals(completion?.body?._lock_token, result.claim.lock_token);
  assertEquals(completion?.body?._billing_outcome, "unknown");
  assertEquals(result.calls.some((call) => call.path.startsWith("/v1/customers/")), false);
});

Deno.test("reconciliation resolves verified actor with runtime-bound customer lookup and completes truthful counters", async () => {
  const result = await runScenario("success");
  assertEquals(result.status, 200);
  assertEquals(result.body, { success: true, claimed: 1, completed: 1, retryable: 0, failed: 0, deferred: 0, deadlineReached: false });
  const customerLookup = result.calls.find((call) => call.path === "/rest/v1/billing_customers");
  assertEquals(Boolean(customerLookup), true);
  assertEquals(customerLookup?.query.includes(`user_id=eq.${result.claim.user_id}`), true);
  assertEquals(customerLookup?.query.includes("runtime_mode=eq.test"), true);
  assertEquals(customerLookup?.query.includes("livemode=eq.false"), true);
  const completion = result.calls.find((call) => call.path.endsWith("/complete_role_switch_reconciliation_attempt"));
  assertEquals(completion?.body?._audit_id, result.claim.audit_id);
  assertEquals(completion?.body?._user_id, result.claim.user_id);
  assertEquals(completion?.body?._lock_token, result.claim.lock_token);
  assertEquals(completion?.body?._billing_outcome, "not_required");
  assertEquals(result.calls.some((call) => call.method !== "GET" && call.path.startsWith("/v1/")), false);
});

Deno.test("reconciliation ambiguity settles unknown against the claimed tuple without invented success", async () => {
  const result = await runScenario("billing-error");
  assertEquals(result.status, 200);
  assertEquals(result.body, { success: true, claimed: 1, completed: 0, retryable: 1, failed: 0, deferred: 0, deadlineReached: false });
  const completion = result.calls.find((call) => call.path.endsWith("/complete_role_switch_reconciliation_attempt"));
  assertEquals(completion?.body?._audit_id, result.claim.audit_id);
  assertEquals(completion?.body?._user_id, result.claim.user_id);
  assertEquals(completion?.body?._lock_token, result.claim.lock_token);
  assertEquals(completion?.body?._billing_outcome, "unknown");
  assertEquals(completion?.body?._billing_error, "customer_resolution_failed");
  assertEquals(completion?.body?._cancelled_count, null);
  assertEquals(result.calls.some((call) => call.path.startsWith("/v1/subscriptions/")), false);
});

Deno.test("work deadline releases the claimed audit before returning HTTP 504", async () => {
  const result = await runScenario("deadline");
  assertEquals(result.status, 504);
  assertEquals(result.body, { success: false, claimed: 1, completed: 0, retryable: 0, failed: 0, deferred: 1, deadlineReached: true });
  const paths = result.calls.map((call) => call.path);
  const claimIndex = paths.indexOf("/rest/v1/rpc/claim_role_switch_reconciliation_batch");
  const userIndex = paths.indexOf(`/auth/v1/admin/users/${result.claim.user_id}`);
  const releaseIndex = paths.indexOf("/rest/v1/rpc/release_role_switch_reconciliation_claims");
  assertEquals(claimIndex < userIndex && userIndex < releaseIndex, true);
  const release = result.calls[releaseIndex];
  assertEquals(release.body?._audit_ids, [result.claim.audit_id]);
  assertEquals(typeof release.body?._worker_id, "string");
  assertEquals(result.calls.some((call) => call.path.endsWith("/complete_role_switch_reconciliation_attempt")), false);
});

Deno.test("release RPC failure preserves deferred count and reports failure at HTTP 504", async () => {
  const result = await runScenario("release-error");
  assertEquals(result.status, 504);
  assertEquals(result.body, { success: false, claimed: 1, completed: 0, retryable: 0, failed: 1, deferred: 1, deadlineReached: true });
  const release = result.calls.find((call) => call.path.endsWith("/release_role_switch_reconciliation_claims"));
  assertEquals(release?.body?._audit_ids, [result.claim.audit_id]);
  assertEquals(result.calls.filter((call) => call.path.endsWith("/release_role_switch_reconciliation_claims")).length, 1);
  assertEquals(result.calls.some((call) => call.path.endsWith("/complete_role_switch_reconciliation_attempt")), false);
});

Deno.test("reconciliation maps claim and completion transport errors without success", async () => {
  const claimFailure = await runScenario("claim-error");
  assertEquals(claimFailure.status, 500);
  assertEquals(claimFailure.body, { error: "Reconciliation unavailable" });
  const completionFailure = await runScenario("complete-error");
  assertEquals(completionFailure.status, 500);
  assertEquals(completionFailure.body?.failed, 1);
  assertEquals(completionFailure.body?.success, false);
});

Deno.test("account verification rejection maps to JSON 500 before claim or customer work", async () => {
  const result = await runScenario("account-error");
  assertEquals(result.status, 500);
  assertEquals(result.contentType, "application/json");
  assertEquals(result.body, { error: "Reconciliation unavailable" });
  assertEquals(result.calls.some((call) => call.path.includes("claim_role_switch")), false);
  assertEquals(result.calls.some((call) => call.path.startsWith("/v1/customers/")), false);
});

restore();
