/**
 * Tests for process-email-queue edge function (internal/cron).
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");
const roleToken = `header.${btoa(JSON.stringify({ role: "service_role" }))}.signature`;
const serviceRequest = () => req("POST", {}, { Authorization: `Bearer ${roleToken}` });

interface Scenario {
  oldCheck?: boolean;
  logError?: boolean;
  logReject?: boolean;
  stateError?: boolean;
  stateReject?: boolean;
  zeroStateRows?: boolean;
  doubleStateRows?: boolean;
  wrongStateRow?: boolean;
  acceptedFirst?: boolean;
}

async function exercise(scenario: Scenario, verify: (proof: {
  response: Response;
  logs: Record<string, unknown>[];
  calls: string[];
  cooldown: string | null;
  sends: number;
  repeat: () => Promise<Response>;
  sendCount: () => number;
}) => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const logs: Record<string, unknown>[] = [];
  const calls: string[] = [];
  let cooldown: string | null = null;
  let sends = 0;
  const messages = [
    ...(scenario.acceptedFirst ? [{ msg_id: 10, read_ct: 1, message: { to: "first@example.test", html: "ok" } }] : []),
    { msg_id: 11, read_ct: 1, message: { to: "second@example.test", html: "limit" } },
  ];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const method = request.method;
    const raw = method === "GET" ? "" : await request.clone().text();
    const body = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    if (url.hostname === "api.brevo.com" && url.pathname === "/v3/smtp/email") {
      sends++;
      if (scenario.acceptedFirst && sends === 1) return json({ messageId: "accepted-1" }, 201);
      return new Response("rate limited", { status: 429, headers: { "retry-after": "120" } });
    }
    if (url.hostname !== "test.supabase.co") throw new Error(`Denied test network: ${url.origin}`);
    calls.push(`${method} ${url.pathname}`);
    if (url.pathname.endsWith("/email_send_state") && method === "GET") {
      return json({ retry_after_until: cooldown, batch_size: 10, send_delay_ms: 0,
        auth_email_ttl_minutes: 15, transactional_email_ttl_minutes: 60 });
    }
    if (url.pathname.endsWith("/rpc/read_email_batch")) {
      return json(body.queue_name === "auth_emails" ? messages : []);
    }
    if (url.pathname.endsWith("/email_send_log") && method === "POST") {
      const row = body as Record<string, unknown>;
      if (scenario.oldCheck && row.status === "rate_limited") {
        return json({ code: "23514", message: "email_send_log_status_check" }, 400);
      }
      if (scenario.logReject && row.status === "rate_limited") throw new Error("injected log transport rejection");
      if (scenario.logError && row.status === "rate_limited") {
        return json({ code: "42501", message: "injected log error" }, 403);
      }
      logs.push(row);
      return new Response(null, { status: 201 });
    }
    if (url.pathname.endsWith("/email_send_state") && method === "PATCH") {
      if (scenario.stateReject) throw new Error("injected state transport rejection");
      if (scenario.stateError) return json({ code: "42501", message: "injected state error" }, 403);
      if (scenario.zeroStateRows) return json([]);
      if (scenario.doubleStateRows) return json([{ id: 1 }, { id: 1 }]);
      if (scenario.wrongStateRow) return json([{ id: 2 }]);
      cooldown = String(body.retry_after_until);
      return json([{ id: 1 }]);
    }
    if (url.pathname.endsWith("/rpc/delete_email")) return json(true);
    throw new Error(`Unexpected fake request: ${method} ${url.pathname}`);
  };
  try {
    const response = await handler(serviceRequest());
    await verify({ response, logs, calls, cooldown, sends,
      repeat: () => handler(serviceRequest()), sendCount: () => sends });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("POST without service-role key returns 401", async () => {
  assertEquals((await handler(req("POST", {}))).status, 401);
});

Deno.test("old CHECK rejection is surfaced despite a persisted cooldown", async () => {
  await exercise({ oldCheck: true }, async ({ response, logs, cooldown, sends }) => {
    assertEquals(response.status, 503);
    assertEquals(await response.json(), { processed: 0, stopped: "rate_limited", log_persisted: false, state_persisted: true });
    assertEquals(logs.length, 0);
    assert(cooldown !== null);
    assertEquals(sends, 1);
  });
});

Deno.test("429 writes audit and cooldown without delete or DLQ", async () => {
  await exercise({}, async ({ response, logs, calls, cooldown, sends, repeat, sendCount }) => {
    assertEquals(response.status, 200);
    assertEquals(await response.json(), { processed: 0, stopped: "rate_limited" });
    assertEquals(logs.map((row) => row.status), ["rate_limited"]);
    assert(new Date(cooldown!).getTime() > Date.now() + 110_000);
    assertEquals(sends, 1);
    assertEquals(calls.filter((call) => call.includes("/rpc/delete_email") || call.includes("/rpc/move_to_dlq")), []);
    const skipped = await repeat();
    assertEquals(skipped.status, 200);
    assertEquals(await skipped.json(), { skipped: true, reason: "rate_limited" });
    assertEquals(sendCount(), 1);
    assertEquals(calls.filter((call) => call.includes("/rpc/read_email_batch")).length, 1);
  });
});

for (const [name, scenario, logPersisted, statePersisted] of [
  ["log error", { logError: true }, false, true],
  ["log transport rejection", { logReject: true }, false, true],
  ["state error", { stateError: true }, true, false],
  ["state transport rejection", { stateReject: true }, true, false],
  ["zero state rows", { zeroStateRows: true }, true, false],
  ["two state rows", { doubleStateRows: true }, true, false],
  ["wrong state row", { wrongStateRow: true }, true, false],
] as const) {
  Deno.test(`429 ${name} returns classified 503`, async () => {
    await exercise(scenario, async ({ response, calls, sends }) => {
      assertEquals(response.status, 503);
      assertEquals(await response.json(), { processed: 0, stopped: "rate_limited", log_persisted: logPersisted, state_persisted: statePersisted });
      assertEquals(sends, 1);
      assertEquals(calls.filter((call) => call.includes("/rpc/delete_email") || call.includes("/rpc/move_to_dlq")), []);
    });
  });
}

Deno.test("earlier accepted send remains counted after later 429 log failure", async () => {
  await exercise({ acceptedFirst: true, logError: true }, async ({ response, logs, calls, sends }) => {
    assertEquals(response.status, 503);
    const body = await response.json();
    assertEquals(body.processed, 1);
    assertEquals(body.stopped, "rate_limited");
    assertEquals(logs.map((row) => row.status), ["sent"]);
    assertEquals(sends, 2);
    assertEquals(calls.filter((call) => call.includes("/rpc/delete_email")).length, 1);
  });
});

restore();
