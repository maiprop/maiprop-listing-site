/**
 * Tests for scheduled-followups cron authentication guard.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const TRACE_ID = "11111111-1111-4111-8111-111111111111";
const TRACE_TOKEN = "22222222-2222-4222-8222-222222222222";

function admissionFixture(path: string): Response | null {
  if (path.endsWith("/list_accepted_unapplied_email_operations_for_service")) {
    return new Response("[]", {
      headers: { "content-type": "application/json" },
    });
  }
  if (path.endsWith("/maintain_selected_email_operations_for_service")) {
    return new Response(
      JSON.stringify({ examined: 0, unknown: 0, purged: 0 }),
      { headers: { "content-type": "application/json" } },
    );
  }
  if (path === "/rest/v1/email_send_log") {
    return new Response(null, {
      status: 200,
      headers: { "content-range": "*/0" },
    });
  }
  return null;
}

const CRON_VALUE = crypto.randomUUID();
const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
  {
    CRON_SECRET: CRON_VALUE,
  },
);

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("missing cron secret header returns 401", async () => {
  const res = await handler(req("POST"));
  assertEquals(res.status, 401);
});

Deno.test("wrong cron secret header returns 401", async () => {
  const res = await handler(
    req("POST", {}, { "x-cron-secret": crypto.randomUUID() }),
  );
  assertEquals(res.status, 401);
});

Deno.test("valid cron secret with non-POST method returns 405 before work", async () => {
  const res = await handler(
    new Request("https://functions.supabase.co/fn", {
      method: "GET",
      headers: { "x-cron-secret": CRON_VALUE },
    }),
  );
  assertEquals(res.status, 405);
});

Deno.test("valid cron secret reaches handler and missing env fails closed", async () => {
  Deno.env.delete("SUPABASE_URL");
  const res = await handler(req("POST", {}, { "x-cron-secret": CRON_VALUE }));
  assertEquals(res.status, 500);
});

restore();

Deno.test("scheduler starts and finishes an empty traced batch before returning", async () => {
  const oldFetch = globalThis.fetch;
  Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service-key");
  const calls: string[] = [];
  globalThis.fetch =
    (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      calls.push(url.pathname);
      if (url.pathname.endsWith("/start_scheduled_http_dispatch_for_service")) {
        assertEquals(JSON.parse(String(init?.body)), {
          p_dispatch_id: TRACE_ID,
          p_integration: "scheduled_followups",
        });
        return new Response(
          JSON.stringify({
            decision: "run",
            dispatch_id: TRACE_ID,
            execution_token: TRACE_TOKEN,
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      const admission = admissionFixture(url.pathname);
      if (admission) return admission;
      if (url.pathname === "/rest/v1/marketing_leads") {
        return new Response("[]", {
          headers: { "content-type": "application/json" },
        });
      }
      if (
        url.pathname.endsWith("/finish_scheduled_http_dispatch_for_service")
      ) {
        const body = JSON.parse(String(init?.body));
        assertEquals(body.p_dispatch_id, TRACE_ID);
        assertEquals(body.p_execution_token, TRACE_TOKEN);
        assertEquals(body.p_outcome, "skipped");
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected fake transport ${url.pathname}`);
    }) as typeof fetch;
  try {
    const response = await handler(
      req("POST", {}, {
        "x-cron-secret": CRON_VALUE,
        "x-maiprop-dispatch-id": TRACE_ID,
      }),
    );
    assertEquals(response.status, 200);
    assertEquals((await response.json()).dispatch_id, TRACE_ID);
    assertEquals(calls, [
      "/rest/v1/rpc/start_scheduled_http_dispatch_for_service",
      "/rest/v1/rpc/list_accepted_unapplied_email_operations_for_service",
      "/rest/v1/rpc/maintain_selected_email_operations_for_service",
      "/rest/v1/email_send_log",
      "/rest/v1/marketing_leads",
      "/rest/v1/rpc/finish_scheduled_http_dispatch_for_service",
    ]);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

async function schedulerTraceDecision(
  decision: string,
  finishFails = false,
  returnedId = TRACE_ID,
) {
  const oldFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const pathname =
      new URL(input instanceof Request ? input.url : String(input)).pathname;
    calls.push(pathname);
    if (pathname.endsWith("/start_scheduled_http_dispatch_for_service")) {
      if (decision === "start_error") {
        return new Response(JSON.stringify({ message: "fixture RPC error" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          decision,
          dispatch_id: returnedId,
          ...(decision === "run" ? { execution_token: TRACE_TOKEN } : {}),
        }),
        { headers: { "content-type": "application/json" } },
      );
    }
    const admission = admissionFixture(pathname);
    if (admission) return admission;
    if (pathname === "/rest/v1/marketing_leads") {
      return new Response("[]", {
        headers: { "content-type": "application/json" },
      });
    }
    if (pathname.endsWith("/finish_scheduled_http_dispatch_for_service")) {
      return finishFails
        ? new Response(JSON.stringify({ message: "fixture failure" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        })
        : new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected fake transport ${pathname}`);
  }) as typeof fetch;
  try {
    const response = await handler(
      req("POST", {}, {
        "x-cron-secret": CRON_VALUE,
        "x-maiprop-dispatch-id": TRACE_ID,
      }),
    );
    return { response, body: await response.json(), calls };
  } finally {
    globalThis.fetch = oldFetch;
  }
}

for (const decision of ["replay", "in_progress", "unknown"]) {
  Deno.test(`scheduler ${decision} trace does no business work`, async () => {
    const result = await schedulerTraceDecision(decision);
    assertEquals(result.response.status, 409);
    assertEquals(result.body.dispatch_id, TRACE_ID);
    assertEquals(result.body.execution_token, undefined);
    assertEquals(result.calls, [
      "/rest/v1/rpc/start_scheduled_http_dispatch_for_service",
    ]);
  });
}

Deno.test("scheduler preserves empty business result when trace finish fails", async () => {
  const result = await schedulerTraceDecision("run", true);
  assertEquals(result.response.status, 503);
  assertEquals(result.body.success, true);
  assertEquals(result.body.processed, 0);
  assertEquals(result.body.trace_persistence_complete, false);
  assertEquals(result.body.dispatch_id, TRACE_ID);
});

Deno.test("scheduler rejects malformed dispatch correlation before any RPC or business work", async () => {
  const oldFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (() => {
    calls++;
    throw new Error("Unexpected transport");
  }) as typeof fetch;
  try {
    const response = await handler(
      req("POST", {}, {
        "x-cron-secret": CRON_VALUE,
        "x-maiprop-dispatch-id": "not-a-uuid",
      }),
    );
    assertEquals(response.status, 400);
    assertEquals((await response.json()).dispatch_id, null);
    assertEquals(calls, 0);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

Deno.test("scheduler refuses a start result for another dispatch", async () => {
  const result = await schedulerTraceDecision(
    "run",
    false,
    "77777777-7777-4777-8777-777777777777",
  );
  assertEquals(result.response.status, 503);
  assertEquals(result.body.trace_persistence_complete, false);
  assertEquals(result.calls, [
    "/rest/v1/rpc/start_scheduled_http_dispatch_for_service",
  ]);
});

Deno.test("scheduler start failure cannot reach leads or claim persisted trace", async () => {
  const result = await schedulerTraceDecision("start_error");
  assertEquals(result.response.status, 503);
  assertEquals(result.body.dispatch_id, TRACE_ID);
  assertEquals(result.body.trace_persistence_complete, false);
  assertEquals(result.calls, [
    "/rest/v1/rpc/start_scheduled_http_dispatch_for_service",
  ]);
});

async function scheduledScenario(
  children: { status?: number; body: string }[],
  ages = [2, 9, 30],
  malformedAt: number | null = null,
) {
  const oldFetch = globalThis.fetch;
  Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
  const sent: unknown[] = [];
  let traceFinish: Record<string, unknown> | null = null;
  globalThis.fetch =
    (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (
        url.pathname ===
          "/rest/v1/rpc/start_scheduled_http_dispatch_for_service"
      ) {
        assertEquals(JSON.parse(String(init?.body)).p_dispatch_id, null);
        return new Response(
          JSON.stringify({
            decision: "run",
            dispatch_id: TRACE_ID,
            execution_token: TRACE_TOKEN,
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      const admission = admissionFixture(url.pathname);
      if (admission) return admission;
      if (
        url.pathname ===
          "/rest/v1/rpc/finish_scheduled_http_dispatch_for_service"
      ) {
        traceFinish = JSON.parse(String(init?.body));
        return new Response(null, { status: 204 });
      }
      if (url.pathname === "/rest/v1/marketing_leads") {
        return new Response(
          JSON.stringify(
            ages.map((days, index) =>
              index === malformedAt ? null : ({
                id: `lead-${index}`,
                full_name: "Fixture",
                created_at: new Date(Date.now() - days * 86400000)
                  .toISOString(),
                followup_step: index,
                status: "new",
              })
            ),
          ),
          { headers: { "content-type": "application/json" } },
        );
      }
      if (url.pathname === "/functions/v1/followup-lead") {
        const headers = new Headers(init?.headers);
        assertEquals(
          headers.get("authorization"),
          "Bearer synthetic-service-key",
        );
        assertEquals(headers.get("x-maiprop-parent-dispatch-id"), TRACE_ID);
        assertEquals(
          headers.get("x-maiprop-parent-execution-token"),
          TRACE_TOKEN,
        );
        const next = children[sent.length];
        sent.push(JSON.parse(String(init?.body)));
        if (!next) throw new Error("Unexpected repeated child");
        return new Response(next.body, { status: next.status ?? 200 });
      }
      throw new Error(`Unexpected fake transport ${url.pathname}`);
    }) as typeof fetch;
  try {
    const response = await handler(
      req("POST", {}, { "x-cron-secret": CRON_VALUE }),
    );
    return {
      response,
      body: await response.json(),
      sent,
      traceFinish: traceFinish as Record<string, unknown> | null,
    };
  } finally {
    globalThis.fetch = oldFetch;
  }
}
for (
  const child of [
    { body: '{"success":false}' },
    { body: '{"success":true,"persistence_complete":false}' },
    { body: '{"success":true,"provider_accepted":null}' },
    { body: '{"success":true,"persistence_complete":"false"}' },
    { body: '{"success":true,"outcome":"partial"}' },
    { body: "not-json" },
    { body: "" },
    { body: "{}" },
    { body: '{"success":true,"preview":true}' },
    { status: 500, body: '{"error":"private"}' },
  ]
) {
  Deno.test(`scheduler does not equate HTTP status with completion ${JSON.stringify(child)}`, async () => {
    const result = await scheduledScenario([child], [2]);
    assertEquals(result.response.status, 503);
    assertEquals(result.body.success, false);
    assertEquals(result.body.failed, 1);
    assertEquals(result.body.succeeded, 0);
    assertEquals(result.sent.length, 1);
  });
}
Deno.test("scheduler preserves old child success and exact scheduled steps", async () => {
  const result = await scheduledScenario([
    { body: '{"success":true,"step":1}' },
    {
      body:
        '{"success":true,"step":2,"provider_accepted":true,"persistence_complete":true}',
    },
    { body: '{"success":true,"step":3}' },
  ]);
  assertEquals(result.response.status, 200);
  assertEquals(result.body.succeeded, 3);
  assertEquals(result.body.failed, 0);
  assertEquals(result.sent, [{ lead_id: "lead-0", step: 1 }, {
    lead_id: "lead-1",
    step: 2,
  }, { lead_id: "lead-2", step: 3 }]);
});
Deno.test("scheduler partial batch retains exact counters without retry", async () => {
  const result = await scheduledScenario([{ body: '{"success":true}' }, {
    body: '{"success":false}',
  }, { body: '{"success":true}' }]);
  assertEquals(result.response.status, 503);
  assertEquals([
    result.body.processed,
    result.body.succeeded,
    result.body.failed,
  ], [3, 2, 1]);
  assertEquals(result.sent.length, 3);
});
Deno.test("scheduler no-due and empty batches make no child call", async () => {
  for (const ages of [[], [0.5, 7, 28]]) {
    const result = await scheduledScenario([], ages);
    assertEquals(result.response.status, 200);
    assertEquals(result.body.processed, 0);
    assertEquals(result.sent.length, 0);
  }
});

Deno.test("scheduler late batch error retains completed child counts and partial trace", async () => {
  const result = await scheduledScenario(
    [{ body: '{"success":true}' }],
    [2, 9],
    1,
  );
  assertEquals(result.response.status, 500);
  assertEquals(result.sent.length, 1);
  assertEquals(result.body.success, false);
  assertEquals([
    result.body.processed,
    result.body.succeeded,
    result.body.failed,
  ], [1, 1, 0]);
  assertEquals(result.body.outcome, "partial");
  assertEquals(result.traceFinish?.p_outcome, "partial");
  assertEquals(result.traceFinish?.p_summary, {
    processed: 1,
    succeeded: 1,
    failed: 0,
    outcome: "partial",
  });
});

Deno.test("scheduler batch error before child work records zero attempts", async () => {
  const result = await scheduledScenario([], [2], 0);
  assertEquals(result.response.status, 500);
  assertEquals(result.sent.length, 0);
  assertEquals([
    result.body.processed,
    result.body.succeeded,
    result.body.failed,
  ], [0, 0, 0]);
  assertEquals(result.body.outcome, "failed");
  assertEquals(result.traceFinish?.p_summary, {
    processed: 0,
    succeeded: 0,
    failed: 0,
    outcome: "failed",
  });
});

Deno.test("scheduler repairs accepted operation outside due-lead scan without child send", async () => {
  const oldFetch = globalThis.fetch;
  const opId = "99999999-9999-4999-8999-999999999999";
  const calls: string[] = [];
  globalThis.fetch =
    (async (input: string | URL | Request, init?: RequestInit) => {
      const path =
        new URL(input instanceof Request ? input.url : String(input)).pathname;
      calls.push(path);
      if (path.endsWith("/start_scheduled_http_dispatch_for_service")) {
        return new Response(
          JSON.stringify({
            decision: "run",
            dispatch_id: TRACE_ID,
            execution_token: TRACE_TOKEN,
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      if (
        path.endsWith("/list_accepted_unapplied_email_operations_for_service")
      ) {
        return new Response(
          JSON.stringify([{
            operation_id: opId,
            producer: "marketing_followup",
            state: "accepted",
          }]),
          { headers: { "content-type": "application/json" } },
        );
      }
      if (path.endsWith("/apply_email_dispatch_result_for_service")) {
        assertEquals(JSON.parse(String(init?.body)).p_operation_id, opId);
        return new Response(
          JSON.stringify({ decision: "applied", operation_id: opId }),
          { headers: { "content-type": "application/json" } },
        );
      }
      if (path.endsWith("/maintain_selected_email_operations_for_service")) {
        return new Response(
          JSON.stringify({ examined: 0, unknown: 0, purged: 0 }),
          { headers: { "content-type": "application/json" } },
        );
      }
      if (path === "/rest/v1/email_send_log") {
        return new Response(null, { headers: { "content-range": "*/0" } });
      }
      if (path === "/rest/v1/marketing_leads") {
        return new Response("[]", {
          headers: { "content-type": "application/json" },
        });
      }
      if (path.endsWith("/finish_scheduled_http_dispatch_for_service")) {
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected fake transport ${path}`);
    }) as typeof fetch;
  try {
    const response = await handler(
      req("POST", {}, {
        "x-cron-secret": CRON_VALUE,
        "x-maiprop-dispatch-id": TRACE_ID,
      }),
    );
    const body = await response.json();
    assertEquals(response.status, 200);
    assertEquals(body.repaired, 1);
    assertEquals(calls.includes("/functions/v1/followup-lead"), false);
    assertEquals(
      calls.indexOf("/rest/v1/rpc/apply_email_dispatch_result_for_service") <
        calls.indexOf("/rest/v1/marketing_leads"),
      true,
    );
  } finally {
    globalThis.fetch = oldFetch;
  }
});

Deno.test("scheduler reports permanent held operations despite empty actionable repair list", async () => {
  const oldFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const path =
      new URL(input instanceof Request ? input.url : String(input)).pathname;
    calls.push(path);
    if (path.endsWith("/start_scheduled_http_dispatch_for_service")) {
      return new Response(
        JSON.stringify({
          decision: "run",
          dispatch_id: TRACE_ID,
          execution_token: TRACE_TOKEN,
        }),
        { headers: { "content-type": "application/json" } },
      );
    }
    if (
      path.endsWith("/list_accepted_unapplied_email_operations_for_service")
    ) {
      return new Response("[]", {
        headers: { "content-type": "application/json" },
      });
    }
    if (path.endsWith("/maintain_selected_email_operations_for_service")) {
      return new Response(
        JSON.stringify({ examined: 0, unknown: 0, purged: 0 }),
        { headers: { "content-type": "application/json" } },
      );
    }
    if (path === "/rest/v1/email_send_log") {
      return new Response(null, { headers: { "content-range": "*/1" } });
    }
    if (path === "/rest/v1/marketing_leads") {
      return new Response("[]", {
        headers: { "content-type": "application/json" },
      });
    }
    if (path.endsWith("/finish_scheduled_http_dispatch_for_service")) {
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected fake transport ${path}`);
  }) as typeof fetch;
  try {
    const response = await handler(
      req("POST", {}, {
        "x-cron-secret": CRON_VALUE,
        "x-maiprop-dispatch-id": TRACE_ID,
      }),
    );
    const body = await response.json();
    assertEquals(response.status, 503);
    assertEquals(body.heldOperations, 1);
    assertEquals(body.repairFailures, 0);
    assertEquals(body.outcome, "partial");
    assertEquals(calls.includes("/functions/v1/followup-lead"), false);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

Deno.test("scheduler retains completed repair when later maintenance fails", async () => {
  const oldFetch = globalThis.fetch;
  const opId = "99999999-9999-4999-8999-999999999999";
  let dueReads = 0;
  let finishOutcome = "";
  globalThis.fetch =
    (async (input: string | URL | Request, init?: RequestInit) => {
      const path =
        new URL(input instanceof Request ? input.url : String(input)).pathname;
      if (path.endsWith("/start_scheduled_http_dispatch_for_service")) {
        return new Response(
          JSON.stringify({
            decision: "run",
            dispatch_id: TRACE_ID,
            execution_token: TRACE_TOKEN,
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      if (
        path.endsWith("/list_accepted_unapplied_email_operations_for_service")
      ) {
        return new Response(JSON.stringify([{ operation_id: opId }]), {
          headers: { "content-type": "application/json" },
        });
      }
      if (path.endsWith("/apply_email_dispatch_result_for_service")) {
        return new Response(
          JSON.stringify({ decision: "applied", operation_id: opId }),
          { headers: { "content-type": "application/json" } },
        );
      }
      if (path.endsWith("/maintain_selected_email_operations_for_service")) {
        return new Response(JSON.stringify({ message: "maintenance failed" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
      if (path === "/rest/v1/marketing_leads") {
        dueReads++;
        throw new Error("Due scan should not start");
      }
      if (path.endsWith("/finish_scheduled_http_dispatch_for_service")) {
        finishOutcome = JSON.parse(String(init?.body)).p_outcome;
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected fake transport ${path}`);
    }) as typeof fetch;
  try {
    const response = await handler(
      req("POST", {}, {
        "x-cron-secret": CRON_VALUE,
        "x-maiprop-dispatch-id": TRACE_ID,
      }),
    );
    const body = await response.json();
    assertEquals([
      response.status,
      body.repaired,
      body.outcome,
      finishOutcome,
      dueReads,
    ], [503, 1, "partial", "partial", 0]);
  } finally {
    globalThis.fetch = oldFetch;
  }
});
