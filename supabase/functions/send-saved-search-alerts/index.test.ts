/**
 * Tests for send-saved-search-alerts edge function (cron).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const OP_ID = "88888888-8888-4888-8888-888888888888";
const rpcJson = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
function admissionFixture(path: string): Response | null {
  if (path.endsWith("/list_accepted_unapplied_email_operations_for_service")) {
    return rpcJson([]);
  }
  if (path.endsWith("/maintain_selected_email_operations_for_service")) {
    return rpcJson({ examined: 0, unknown: 0, purged: 0 });
  }
  if (path === "/rest/v1/email_send_log") {
    return new Response(null, {
      status: 200,
      headers: { "content-range": "*/0" },
    });
  }
  return null;
}

const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
  {
    CRON_SECRET: "correct-cron-secret",
  },
);

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("missing cron secret returns 401", async () => {
  const res = await handler(req("POST", {}));
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.ok, false);
});

Deno.test("wrong cron secret returns 401", async () => {
  const res = await handler(
    req("POST", {}, { authorization: "Bearer wrong-secret" }),
  );
  assertEquals(res.status, 401);
});

Deno.test("correct cron secret returns an empty batch without provider work", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push(url.pathname);
    if (
      url.pathname === "/rest/v1/rpc/start_scheduled_http_dispatch_for_service"
    ) {
      return new Response(
        JSON.stringify({
          decision: "run",
          dispatch_id: "55555555-5555-4555-8555-555555555555",
          execution_token: "66666666-6666-4666-8666-666666666666",
        }),
        { headers: { "content-type": "application/json" } },
      );
    }
    const admission = admissionFixture(url.pathname);
    if (admission) return admission;
    if (
      url.pathname === "/rest/v1/rpc/finish_scheduled_http_dispatch_for_service"
    ) return new Response(null, { status: 204 });
    if (url.pathname !== "/rest/v1/saved_searches") {
      throw new Error("Unexpected fake transport");
    }
    return new Response("[]", {
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  try {
    const res = await handler(
      req("POST", {}, { authorization: "Bearer correct-cron-secret" }),
    );
    assertEquals(res.status, 200);
    assertEquals((await res.json()).processed, 0);
    assertEquals(calls, [
      "/rest/v1/rpc/start_scheduled_http_dispatch_for_service",
      "/rest/v1/rpc/list_accepted_unapplied_email_operations_for_service",
      "/rest/v1/rpc/maintain_selected_email_operations_for_service",
      "/rest/v1/saved_searches",
      "/rest/v1/email_send_log",
      "/rest/v1/rpc/finish_scheduled_http_dispatch_for_service",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

restore();

Deno.test("saved alerts trace missing email configuration without querying searches", async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = Deno.env.get("BREVO_API_KEY");
  Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service-key");
  Deno.env.delete("BREVO_API_KEY");
  const calls: string[] = [];
  const dispatchId = "33333333-3333-4333-8333-333333333333";
  const token = "44444444-4444-4444-8444-444444444444";
  globalThis.fetch =
    (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      calls.push(url.pathname);
      if (url.pathname.endsWith("/start_scheduled_http_dispatch_for_service")) {
        assertEquals(
          JSON.parse(String(init?.body)).p_integration,
          "saved_search_alerts",
        );
        return new Response(
          JSON.stringify({
            decision: "run",
            dispatch_id: dispatchId,
            execution_token: token,
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      if (
        url.pathname.endsWith("/finish_scheduled_http_dispatch_for_service")
      ) {
        assertEquals(JSON.parse(String(init?.body)).p_outcome, "skipped");
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected fake transport ${url.pathname}`);
    }) as typeof fetch;
  try {
    const response = await handler(
      req("POST", {}, {
        authorization: "Bearer correct-cron-secret",
        "x-maiprop-dispatch-id": dispatchId,
      }),
    );
    assertEquals(response.status, 503);
    assertEquals((await response.json()).dispatch_id, dispatchId);
    assertEquals(calls, [
      "/rest/v1/rpc/start_scheduled_http_dispatch_for_service",
      "/rest/v1/rpc/finish_scheduled_http_dispatch_for_service",
    ]);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) Deno.env.delete("BREVO_API_KEY");
    else Deno.env.set("BREVO_API_KEY", oldKey);
  }
});

async function savedScenario(
  options: {
    missing?: boolean;
    ids?: string[] | null;
    failure?: string;
    provider?: string;
    concurrent?: string;
    traceDecision?: "run" | "replay";
    finishFails?: boolean;
    concurrentInvocations?: boolean;
    beginLoss?: boolean;
    recordLoss?: boolean;
    existing?: boolean;
    existingSending?: boolean;
    initialSinkEffects?: number;
    repeatAfterAmbiguity?: boolean;
    retryAfterDeadline?: boolean;
    recordLossOnce?: boolean;
    sinkDedupe?: boolean;
    includePriorListing?: boolean;
  } = {},
) {
  const oldFetch = globalThis.fetch;
  const row = {
    id: "11111111-1111-4111-8111-111111111111",
    user_id: "22222222-2222-4222-8222-222222222222",
    name: "Synthetic",
    filters: { city: "Athens" },
    email_alerts: true,
    last_alert_listing_ids: options.ids === undefined ? [] : options.ids,
    last_alert_sent_at: null as string | null,
  };
  const listingId = "33333333-3333-4333-8333-333333333333";
  const priorId = "44444444-4444-4444-8444-444444444444";
  let sends = 0, writes = 0, searchReads = 0, listingReads = 0, authReads = 0;
  const events: string[] = [];
  let operation: {
    state: string;
    payload: unknown;
    expected: Record<string, unknown>;
    token: string | null;
    accepted: boolean;
  } | null = options.existing || options.existingSending
    ? {
      state: options.existingSending ? "sending" : "prepared",
      payload: {
        sender: { email: "alerts@maiprop.co", name: "maiProp Alerts" },
        to: [{ email: "recipient@example.test" }],
        subject: "Frozen saved subject",
        htmlContent: "Frozen saved html",
      },
      expected: {
        user_id: row.user_id,
        filters: structuredClone(row.filters),
        last_alert_listing_ids: row.last_alert_listing_ids,
        last_alert_sent_at: row.last_alert_sent_at,
        recipient_email: "recipient@example.test",
      },
      token: options.existingSending
        ? "99999999-9999-4999-8999-999999999999"
        : null,
      accepted: false,
    }
    : null;
  let recordCalls = 0;
  let beginCalls = 0;
  let sinkEffects = options.initialSinkEffects ?? 0;
  const attemptTokens: string[] = [];
  const payloadBytes: string[] = [];
  const recordArgs: Record<string, unknown>[] = [];
  const sinkKeys = new Set<string>();
  const observedSinkKeys: (string | null)[] = [];
  let traceSummary: Record<string, unknown> | null = null;
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    });
  globalThis.fetch =
    (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ??
        (input instanceof Request ? input.method : "GET");
      if (
        url.pathname ===
          "/rest/v1/rpc/start_scheduled_http_dispatch_for_service"
      ) {
        const requestedId = JSON.parse(String(init?.body)).p_dispatch_id;
        assertEquals(
          [
            "55555555-5555-4555-8555-555555555555",
            "77777777-7777-4777-8777-777777777777",
          ].includes(requestedId),
          true,
        );
        const decision = options.traceDecision ?? "run";
        return json({
          decision,
          dispatch_id: requestedId,
          ...(decision === "run"
            ? { execution_token: "66666666-6666-4666-8666-666666666666" }
            : {}),
        });
      }
      if (
        url.pathname ===
          "/rest/v1/rpc/finish_scheduled_http_dispatch_for_service"
      ) {
        traceSummary = JSON.parse(String(init?.body)).p_summary;
        return options.finishFails
          ? json({ message: "fixture finish failure" }, 500)
          : new Response(null, { status: 204 });
      }
      const admission = admissionFixture(url.pathname);
      if (admission) return admission;
      if (
        url.pathname === "/rest/v1/rpc/get_selected_email_operation_for_service"
      ) {
        events.push(`lookup:${operation?.state ?? "absent"}`);
        return json(
          operation && operation.state !== "applied"
            ? {
              decision: "existing",
              operation_id: OP_ID,
              state: operation.state,
              entity_hold: operation.state !== "applied",
              accepted: operation.accepted,
              payload: operation.payload,
            }
            : { decision: "absent" },
        );
      }
      if (
        url.pathname === "/rest/v1/rpc/prepare_saved_search_alert_for_service"
      ) {
        events.push(`prepare:${operation?.state ?? "absent"}`);
        const args = JSON.parse(String(init?.body));
        assertEquals(
          args.p_expected.last_alert_listing_ids,
          options.ids === undefined ? [] : options.ids,
        );
        assertEquals(args.p_expected.last_alert_sent_at, null);
        assertEquals(
          args.p_candidate_ids,
          options.includePriorListing ? [listingId, priorId] : [listingId],
        );
        assertEquals(args.p_sent_ids, [listingId]);
        if (operation) {
          return json({
            decision: "existing",
            operation_id: OP_ID,
            state: operation.state,
          });
        }
        operation = {
          state: "prepared",
          payload: args.p_payload,
          expected: args.p_expected,
          token: null,
          accepted: false,
        };
        return json({
          decision: "prepared",
          operation_id: OP_ID,
          state: "prepared",
        });
      }
      if (url.pathname === "/rest/v1/rpc/begin_email_dispatch_for_service") {
        events.push(`begin:${operation?.state ?? "absent"}`);
        const args = JSON.parse(String(init?.body));
        beginCalls++;
        attemptTokens.push(args.p_attempt_token);
        if (!operation) throw new Error("Begin without prepare");
        if (options.beginLoss && beginCalls === 1) {
          operation.state = "sending";
          operation.token = args.p_attempt_token;
          throw new Error("Lost committed begin response");
        }
        if (operation.accepted) {
          return json({ decision: "replay_accepted", operation_id: OP_ID });
        }
        if (operation.state === "sending" || operation.state === "unknown") {
          return json({
            decision: operation.state === "sending" ? "busy" : "unknown",
            operation_id: OP_ID,
          });
        }
        if (operation.state === "retryable") {
          if (!options.retryAfterDeadline || beginCalls < 2) {
            return json({
              decision: "busy",
              operation_id: OP_ID,
              not_before: "2026-10-01T00:00:00Z",
            });
          }
        }
        operation.token = args.p_attempt_token;
        operation.state = "sending";
        return json({
          decision: "send",
          operation_id: OP_ID,
          attempt_token: args.p_attempt_token,
          payload: operation.payload,
        });
      }
      if (
        url.pathname === "/rest/v1/rpc/record_email_dispatch_result_for_service"
      ) {
        recordCalls++;
        const args = JSON.parse(String(init?.body));
        recordArgs.push(structuredClone(args));
        if (!operation || args.p_attempt_token !== operation.token) {
          throw new Error("Wrong attempt");
        }
        operation.state = args.p_outcome === "rejected_retryable"
          ? "retryable"
          : args.p_outcome;
        operation.accepted = args.p_outcome === "accepted";
        if (
          (options.recordLoss && recordCalls <= 2) ||
          (options.recordLossOnce && recordCalls === 1)
        ) {
          throw new Error("Lost committed record response");
        }
        return new Response(null, { status: 204 });
      }
      if (
        url.pathname === "/rest/v1/rpc/apply_email_dispatch_result_for_service"
      ) {
        writes++;
        if (options.failure === "update") {
          return json({ message: "private-db" }, 500);
        }
        if (!operation || !operation.accepted) {
          throw new Error("Apply before acceptance");
        }
        const expected = operation.expected;
        if (
          options.failure === "deleted" || row.user_id !== expected.user_id ||
          row.email_alerts !== true ||
          JSON.stringify(row.filters) !== JSON.stringify(expected.filters) ||
          JSON.stringify(row.last_alert_listing_ids) !==
            JSON.stringify(expected.last_alert_listing_ids)
        ) {
          operation.state = "accepted_conflict";
          return json({ decision: "conflict", operation_id: OP_ID });
        }
        row.last_alert_listing_ids = options.includePriorListing
          ? [listingId, priorId]
          : [listingId];
        row.last_alert_sent_at = "2026-09-30T00:00:00.000Z";
        operation.state = "applied";
        return json({ decision: "applied", operation_id: OP_ID });
      }
      if (url.hostname === "api.brevo.com") {
        events.push(`send:${operation?.state ?? "absent"}`);
        sends++;
        const headers = new Headers(init?.headers);
        const sinkKey = headers.get("Idempotency-Key") ??
          headers.get("X-Idempotency-Key");
        observedSinkKeys.push(sinkKey);
        payloadBytes.push(String(init?.body));
        assertEquals(JSON.parse(String(init?.body)), operation?.payload);
        if (
          (options.provider !== "rate" ||
            (options.retryAfterDeadline && sends === 2)) &&
          options.provider !== "reject" &&
          options.provider !== "server" &&
          (!options.sinkDedupe || !sinkKey || !sinkKeys.has(sinkKey))
        ) sinkEffects++;
        if (sinkKey) sinkKeys.add(sinkKey);
        if (options.concurrent === "filters") row.filters.city = "Patras";
        if (options.concurrent === "consent") row.email_alerts = false;
        if (options.concurrent === "ids") {
          row.last_alert_listing_ids = [listingId];
        }
        if (options.provider === "timeout") {
          throw new DOMException("Timed out", "TimeoutError");
        }
        if (
          options.provider === "rate" && !(
            options.retryAfterDeadline && sends === 2
          )
        ) {
          return json({ code: "rate_limited" }, 429);
        }
        if (options.provider === "server") {
          return json({ code: "server_error" }, 503);
        }
        return options.provider === "reject"
          ? json({ code: "invalid_parameter" }, 403)
          : new Response("", { status: 201 });
      }
      if (url.pathname === "/rest/v1/saved_searches" && method === "GET") {
        searchReads++;
        return options.failure === "search"
          ? json({ message: "private-db" }, 500)
          : json([structuredClone(row)]);
      }
      if (url.pathname === "/rest/v1/listings") {
        listingReads++;
        return options.failure === "list"
          ? json({ message: "private-db" }, 500)
          : json([
            { id: listingId, title: "Fixture", city: "Athens", price: 100 },
            ...(options.includePriorListing
              ? [{
                id: priorId,
                title: "Prior fixture",
                city: "Athens",
                price: 90,
              }]
              : []),
          ]);
      }
      if (url.pathname.startsWith("/auth/v1/admin/users/")) {
        authReads++;
        return options.failure === "auth"
          ? json({ message: "private-auth" }, 500)
          : json({ id: row.user_id, email: "recipient@example.test" });
      }
      throw new Error(`Unexpected fake transport ${method} ${url.pathname}`);
    }) as typeof fetch;
  Deno.env.set("BREVO_API_KEY", "placeholder");
  try {
    if (options.missing) {
      Deno.env.delete("BREVO_API_KEY");
      const unauthorized = await handler(req("POST", {}));
      assertEquals(unauthorized.status, 401);
      const unavailable = await handler(
        req("POST", {}, {
          authorization: "Bearer correct-cron-secret",
          "x-maiprop-dispatch-id": "77777777-7777-4777-8777-777777777777",
        }),
      );
      assertEquals(unavailable.status, 503);
      assertEquals(writes, 0);
      assertEquals(sends, 0);
      assertEquals(row.last_alert_listing_ids, []);
      Deno.env.set("BREVO_API_KEY", "placeholder");
    }
    const first = handler(
      req("POST", {}, {
        authorization: "Bearer correct-cron-secret",
        "x-maiprop-dispatch-id": "55555555-5555-4555-8555-555555555555",
      }),
    );
    const second = options.concurrentInvocations
      ? handler(
        req("POST", {}, {
          authorization: "Bearer correct-cron-secret",
          "x-maiprop-dispatch-id": "77777777-7777-4777-8777-777777777777",
        }),
      )
      : null;
    const response = await first;
    const secondResponse = second
      ? await second
      : options.repeatAfterAmbiguity || options.retryAfterDeadline
      ? await handler(
        req("POST", {}, {
          authorization: "Bearer correct-cron-secret",
          "x-maiprop-dispatch-id": "77777777-7777-4777-8777-777777777777",
        }),
      )
      : null;
    return {
      response,
      body: await response.json(),
      secondResponse,
      row,
      sends,
      writes,
      searchReads,
      traceSummary,
      operationState: (operation as { state: string } | null)?.state,
      events,
      recordCalls,
      listingReads,
      authReads,
      sinkEffects,
      attemptTokens,
      payloadBytes,
      recordArgs,
      observedSinkKeys,
    };
  } finally {
    globalThis.fetch = oldFetch;
    Deno.env.set("BREVO_API_KEY", "placeholder-brevo");
  }
}

Deno.test("missing sender cannot suppress the same match after configuration", async () => {
  const result = await savedScenario({ missing: true });
  assertEquals(result.response.status, 200);
  assertEquals(result.sends, 1, JSON.stringify(result.events));
  assertEquals(result.writes, 1);
  assertEquals(result.body.emailsSent, 1);
  assertEquals(result.body.checkpointsPersisted, 1);
});
for (const ids of [null, []]) {
  Deno.test(`saved alert preserves exact original ${JSON.stringify(ids)} checkpoint`, async () => {
    const result = await savedScenario({ ids });
    assertEquals(result.response.status, 200);
    assertEquals(result.row.last_alert_listing_ids?.length, 1);
  });
}
for (const failure of ["search", "list", "auth", "update", "deleted"]) {
  Deno.test(`saved alert reports ${failure} failure without false completion`, async () => {
    const result = await savedScenario({ failure });
    assertEquals(result.response.status, 503);
    assertEquals(result.body.ok, false);
    assertEquals(JSON.stringify(result.body).includes("private"), false);
    assertEquals(result.sends, ["update", "deleted"].includes(failure) ? 1 : 0);
    assertEquals(result.row.last_alert_listing_ids, []);
    if (result.sends) {
      assertEquals(result.body.provider_accepted, true);
      assertEquals(result.body.persistence_complete, false);
    }
  });
}
for (const concurrent of ["filters", "consent", "ids"]) {
  Deno.test(`saved alert does not overwrite concurrent ${concurrent}`, async () => {
    const result = await savedScenario({ concurrent });
    assertEquals(result.response.status, 503);
    assertEquals(result.body.persistence_complete, false);
    assertEquals(result.sends, 1);
    if (concurrent === "filters") {
      assertEquals(result.row.filters.city, "Patras");
    }
    if (concurrent === "consent") assertEquals(result.row.email_alerts, false);
  });
}
for (const provider of ["reject", "timeout"]) {
  Deno.test(`saved alert ${provider} does not advance checkpoint`, async () => {
    const result = await savedScenario({ provider });
    assertEquals(result.response.status, 503);
    assertEquals(result.body.ok, false);
    assertEquals(result.writes, 0);
    assertEquals(result.sends, 1);
    assertEquals(
      result.body[provider === "reject" ? "sendsRejected" : "sendsUnknown"],
      1,
    );
  });
}

Deno.test("already checkpointed saved match does not send or write again", async () => {
  const result = await savedScenario({
    ids: ["33333333-3333-4333-8333-333333333333"],
  });
  assertEquals(result.response.status, 200);
  assertEquals(result.sends, 0);
  assertEquals(result.writes, 0);
  assertEquals(result.body.emailsSent, 0);
});

Deno.test("saved alert trace summary retains counts without recipient or content", async () => {
  const result = await savedScenario();
  assertEquals(result.traceSummary, {
    processed: 1,
    emailsSent: 1,
    checkpointsPersisted: 1,
    failed: 0,
    provider_accepted: true,
    persistence_complete: true,
    outcome: "succeeded",
  });
  assertEquals(result.body.dispatch_id !== undefined, true);
});

Deno.test("saved alert replay never looks up a recipient or sends", async () => {
  const result = await savedScenario({ traceDecision: "replay" });
  assertEquals(result.response.status, 409);
  assertEquals(result.sends, 0);
  assertEquals(result.writes, 0);
  assertEquals(result.searchReads, 0);
  assertEquals(result.traceSummary, null);
});

Deno.test("saved alert finish failure keeps accepted send and checkpoint visible", async () => {
  const result = await savedScenario({ finishFails: true });
  assertEquals(result.response.status, 503);
  assertEquals(result.sends, 1);
  assertEquals(result.writes, 1);
  assertEquals(result.body.emailsSent, 1);
  assertEquals(result.body.checkpointsPersisted, 1);
  assertEquals(result.body.provider_accepted, true);
  assertEquals(result.body.persistence_complete, true);
  assertEquals(result.body.trace_persistence_complete, false);
});

Deno.test("concurrent saved invocations admit one provider request and retain one applied operation", async () => {
  const result = await savedScenario({ concurrentInvocations: true });
  assertEquals(result.secondResponse !== null, true);
  assertEquals(result.sends, 1, JSON.stringify(result.events));
  assertEquals(result.operationState, "applied");
  assertEquals(result.row.last_alert_listing_ids?.length, 1);
});

Deno.test("saved alerts repair accepted operation outside current search scan", async () => {
  const oldFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch =
    (async (input: string | URL | Request, init?: RequestInit) => {
      const path =
        new URL(input instanceof Request ? input.url : String(input)).pathname;
      calls.push(path);
      if (path.endsWith("/start_scheduled_http_dispatch_for_service")) {
        return rpcJson({
          decision: "run",
          dispatch_id: "55555555-5555-4555-8555-555555555555",
          execution_token: "66666666-6666-4666-8666-666666666666",
        });
      }
      if (
        path.endsWith("/list_accepted_unapplied_email_operations_for_service")
      ) {
        return rpcJson([{
          operation_id: OP_ID,
          producer: "saved_search_alert",
          state: "accepted",
        }]);
      }
      if (path.endsWith("/apply_email_dispatch_result_for_service")) {
        assertEquals(JSON.parse(String(init?.body)).p_operation_id, OP_ID);
        return rpcJson({ decision: "applied", operation_id: OP_ID });
      }
      if (path.endsWith("/maintain_selected_email_operations_for_service")) {
        return rpcJson({ examined: 0, unknown: 0, purged: 0 });
      }
      if (path === "/rest/v1/saved_searches") return rpcJson([]);
      if (path === "/rest/v1/email_send_log") {
        return new Response(null, { headers: { "content-range": "*/0" } });
      }
      if (path.endsWith("/finish_scheduled_http_dispatch_for_service")) {
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected fake transport ${path}`);
    }) as typeof fetch;
  try {
    const response = await handler(
      req("POST", {}, { authorization: "Bearer correct-cron-secret" }),
    );
    const body = await response.json();
    assertEquals(response.status, 200);
    assertEquals(body.repaired, 1);
    assertEquals(body.emailsSent, 0);
    assertEquals(
      calls.indexOf("/rest/v1/rpc/apply_email_dispatch_result_for_service") <
        calls.indexOf("/rest/v1/saved_searches"),
      true,
    );
    assertEquals(calls.includes("/v3/smtp/email"), false);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

Deno.test("saved alerts report permanent hold when repair page is empty", async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const path =
      new URL(input instanceof Request ? input.url : String(input)).pathname;
    if (path.endsWith("/start_scheduled_http_dispatch_for_service")) {
      return rpcJson({
        decision: "run",
        dispatch_id: "55555555-5555-4555-8555-555555555555",
        execution_token: "66666666-6666-4666-8666-666666666666",
      });
    }
    if (
      path.endsWith("/list_accepted_unapplied_email_operations_for_service")
    ) return rpcJson([]);
    if (path.endsWith("/maintain_selected_email_operations_for_service")) {
      return rpcJson({ examined: 0, unknown: 0, purged: 0 });
    }
    if (path === "/rest/v1/saved_searches") return rpcJson([]);
    if (path === "/rest/v1/email_send_log") {
      return new Response(null, { headers: { "content-range": "*/1" } });
    }
    if (path.endsWith("/finish_scheduled_http_dispatch_for_service")) {
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected fake transport ${path}`);
  }) as typeof fetch;
  try {
    const response = await handler(
      req("POST", {}, { authorization: "Bearer correct-cron-secret" }),
    );
    const body = await response.json();
    assertEquals(response.status, 503);
    assertEquals(body.heldOperations, 1);
    assertEquals(body.heldAttempts, 0);
    assertEquals(body.outcome, "partial");
  } finally {
    globalThis.fetch = oldFetch;
  }
});

Deno.test("saved alert resumes frozen payload without listing or recipient lookup", async () => {
  const result = await savedScenario({ existing: true });
  assertEquals(result.response.status, 200);
  assertEquals(result.sends, 1);
  assertEquals(result.searchReads, 1);
  assertEquals([result.listingReads, result.authReads], [0, 0]);
  assertEquals(result.events.includes("prepare:absent"), false);
});
Deno.test("saved alert freezes full ordered candidate separately from newly mailed subset", async () => {
  const priorId = "44444444-4444-4444-8444-444444444444";
  const result = await savedScenario({
    ids: [priorId],
    includePriorListing: true,
  });
  assertEquals(result.response.status, 200);
  assertEquals(result.sends, 1);
  assertEquals(result.row.last_alert_listing_ids, [
    "33333333-3333-4333-8333-333333333333",
    priorId,
  ]);
});
for (
  const options of [{ beginLoss: true }, { recordLoss: true }, {
    provider: "rate",
  }, { provider: "server" }]
) {
  Deno.test(`saved alert holds or rejects ${JSON.stringify(options)} without checkpoint`, async () => {
    const result = await savedScenario(options);
    assertEquals(result.response.status, 503);
    assertEquals(result.sends, options.beginLoss ? 0 : 1);
    assertEquals(result.writes, 0);
    if (options.recordLoss) assertEquals(result.recordCalls, 2);
    if (options.provider === "rate") {
      assertEquals(result.operationState, "retryable");
    }
    if (options.provider === "server") {
      assertEquals(result.operationState, "unknown");
    }
  });
}

for (const sinkDedupe of [false, true]) {
  for (const mode of ["begin", "transport", "record"] as const) {
    Deno.test(`saved alert ${mode} ambiguity remains fenced on next run with sink dedupe ${sinkDedupe}`, async () => {
      const result = await savedScenario({
        beginLoss: mode === "begin",
        provider: mode === "transport" ? "timeout" : undefined,
        recordLoss: mode === "record",
        repeatAfterAmbiguity: true,
        sinkDedupe,
      });
      assertEquals(result.sends, mode === "begin" ? 0 : 1);
      assertEquals(result.sinkEffects, mode === "begin" ? 0 : 1);
      assertEquals(result.observedSinkKeys, mode === "begin" ? [] : [null]);
      assertEquals(result.listingReads, 1);
      assertEquals(result.authReads, 1);
      assertEquals(
        result.operationState,
        mode === "begin"
          ? "sending"
          : mode === "transport"
          ? "unknown"
          : "applied",
      );
      if (mode === "record") {
        assertEquals(result.recordArgs[0], result.recordArgs[1]);
      }
      assertEquals(
        result.secondResponse?.status,
        mode === "record" ? 200 : 503,
      );
    });
  }
}

Deno.test("saved alert restart after simulated death after committed begin makes no new sink call", async () => {
  const result = await savedScenario({
    existingSending: true,
    initialSinkEffects: 1,
    repeatAfterAmbiguity: true,
  });
  assertEquals([result.sends, result.sinkEffects, result.writes], [0, 1, 0]);
  assertEquals([result.listingReads, result.authReads], [0, 0]);
  assertEquals(result.operationState, "sending");
  assertEquals(result.secondResponse?.status, 503);
});

Deno.test("saved alert durable 429 permits one byte-identical frozen retry after deadline", async () => {
  const result = await savedScenario({
    provider: "rate",
    retryAfterDeadline: true,
  });
  assertEquals([result.sends, result.listingReads, result.authReads], [
    2,
    1,
    1,
  ]);
  assertEquals(result.payloadBytes[0], result.payloadBytes[1]);
  assertEquals(result.attemptTokens.length, 2);
  assertEquals(result.attemptTokens[0] === result.attemptTokens[1], false);
  assertEquals(result.operationState, "applied");
  assertEquals(result.secondResponse?.status, 200);
  assertEquals(result.row.last_alert_listing_ids, [
    "33333333-3333-4333-8333-333333333333",
  ]);
});

Deno.test("saved alert lost first record response repeats identical known result", async () => {
  const result = await savedScenario({ recordLossOnce: true });
  assertEquals([result.sends, result.recordCalls, result.writes], [1, 2, 1]);
  assertEquals(result.recordArgs[0], result.recordArgs[1]);
});
