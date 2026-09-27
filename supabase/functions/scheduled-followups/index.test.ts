/**
 * Tests for scheduled-followups cron authentication guard.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const CRON_VALUE = crypto.randomUUID();
const { handler, restore } = await captureHandler(import.meta.url, "./index.ts", {
  CRON_SECRET: CRON_VALUE,
});

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("missing cron secret header returns 401", async () => {
  const res = await handler(req("POST"));
  assertEquals(res.status, 401);
});

Deno.test("wrong cron secret header returns 401", async () => {
  const res = await handler(req("POST", {}, { "x-cron-secret": crypto.randomUUID() }));
  assertEquals(res.status, 401);
});

Deno.test("valid cron secret with non-POST method returns 405 before work", async () => {
  const res = await handler(new Request("https://functions.supabase.co/fn", {
    method: "GET",
    headers: { "x-cron-secret": CRON_VALUE },
  }));
  assertEquals(res.status, 405);
});

Deno.test("valid cron secret reaches handler and missing env fails closed", async () => {
  Deno.env.delete("SUPABASE_URL");
  const res = await handler(req("POST", {}, { "x-cron-secret": CRON_VALUE }));
  assertEquals(res.status, 500);
});

restore();

async function scheduledScenario(
  children: { status?: number; body: string }[],
  ages = [2, 9, 30],
) {
  const oldFetch = globalThis.fetch;
  Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
  const sent: unknown[] = [];
  globalThis.fetch =
    (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === "/rest/v1/marketing_leads") {
        return new Response(
          JSON.stringify(
            ages.map((days, index) => ({
              id: `lead-${index}`,
              full_name: "Fixture",
              created_at: new Date(Date.now() - days * 86400000).toISOString(),
              followup_step: index,
              status: "new",
            })),
          ),
          { headers: { "content-type": "application/json" } },
        );
      }
      if (url.pathname === "/functions/v1/followup-lead") {
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
    return { response, body: await response.json(), sent };
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
