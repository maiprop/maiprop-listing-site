import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Webhook } from "npm:standardwebhooks@1.0.0";
import { captureHandler } from "../_shared/testUtils.ts";

const signingKey = btoa("synthetic-auth-admission-key");
const { handler, restore } = await captureHandler(import.meta.url, "./index.ts", {
  SEND_EMAIL_HOOK_SECRET: `v1,whsec_${signingKey}`,
  BREVO_API_KEY: "synthetic-brevo-key",
  BREVO_FROM_EMAIL: "sender@example.test",
  SENTRY_DSN: "",
});
const change = {
  user: { id: "synthetic-user", email: "current@example.test", new_email: "next@example.test" },
  email_data: { email_action_type: "email_change", token: "private-current-token", token_hash_new: "private-current-hash",
    token_new: "private-new-token", token_hash: "private-new-hash", site_url: "https://example.test" },
};

function signed(id: string, payload: unknown) {
  const body = JSON.stringify(payload);
  const time = new Date(Math.floor(Date.now() / 1000) * 1000);
  const headers = { "content-type": "application/json", "webhook-id": id,
    "webhook-timestamp": String(Math.floor(time.getTime() / 1000)),
    "webhook-signature": new Webhook(signingKey).sign(id, time, body) };
  return () => new Request("https://functions.supabase.co/auth-email-hook", { method: "POST", headers, body });
}

async function network(run: (sends: string[], rpcArgs: Record<string, unknown>[]) => Promise<void>,
  provider: (slot: string, ordinal: number) => Promise<Response> = async () => new Response(null, { status: 201 })) {
  const original = globalThis.fetch;
  const rows = new Map<string, { state: string; token: string }>();
  const sends: string[] = [];
  const rpcArgs: Record<string, unknown>[] = [];
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const body = init?.body ? String(init.body) : input instanceof Request ? await input.clone().text() : "";
    if (url === "https://api.brevo.com/v3/smtp/email") {
      assertEquals(init?.method, "POST");
      const sent = JSON.parse(body) as { headers: Record<string, string>; tags: string[]; to: Array<{ email: string }>; htmlContent: string };
      const slot = sent.headers["X-MaiProp-Template"];
      assertEquals(sent.tags, [slot]);
      if (slot === "email_change_current") {
        assertEquals(sent.to, [{ email: "current@example.test" }]);
        assertEquals(sent.htmlContent.includes("private-current-hash"), true);
        assertEquals(sent.htmlContent.includes("private-new-hash"), false);
      }
      if (slot === "email_change_new") {
        assertEquals(sent.to, [{ email: "next@example.test" }]);
        assertEquals(sent.htmlContent.includes("private-new-hash"), true);
        assertEquals(sent.htmlContent.includes("private-current-hash"), false);
      }
      if (["signup", "invite", "magiclink", "recovery"].includes(slot)) {
        assertEquals(sent.to, [{ email: "current@example.test" }]);
        assertEquals(sent.htmlContent.includes("private-hash"), true);
      }
      if (slot === "reauthentication") {
        assertEquals(sent.to, [{ email: "current@example.test" }]);
        assertEquals(sent.htmlContent.includes("private-token"), true);
      }
      sends.push(slot);
      return provider(slot, sends.length);
    }
    if (!url.startsWith("https://test.supabase.co/rest/v1/rpc/")) throw new Error("unexpected network target");
    const name = new URL(url).pathname.split("/").pop();
    const args = JSON.parse(body) as Record<string, unknown>;
    rpcArgs.push(args);
    const key = `${args.p_webhook_id}:${args.p_slot}`;
    const row = rows.get(key);
    let data: Record<string, unknown>;
    if (name === "begin_auth_email_dispatch_for_service") {
      if (row) data = { decision: row.state === "accepted" ? "replay_accepted" : row.state === "unknown" ? "unknown" : "busy", state: row.state, webhook_id: args.p_webhook_id, slot: args.p_slot };
      else {
        rows.set(key, { state: "sending", token: String(args.p_attempt_token) });
        data = { decision: "send", state: "sending", webhook_id: args.p_webhook_id, slot: args.p_slot, attempt_token: args.p_attempt_token };
      }
    } else if (name === "record_auth_email_dispatch_result_for_service") {
      assertEquals(args.p_attempt_token, row?.token);
      row!.state = String(args.p_outcome);
      data = { decision: "recorded", state: row!.state, webhook_id: args.p_webhook_id, slot: args.p_slot, attempt_token: args.p_attempt_token };
    } else throw new Error("unexpected RPC");
    return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
  };
  try { await run(sends, rpcArgs); } finally { globalThis.fetch = original; }
}

async function captureConsole(run: (lines: string[]) => Promise<void>) {
  const original = { error: console.error, warn: console.warn, log: console.log };
  const lines: string[] = [];
  const capture = (...values: unknown[]) => lines.push(values.map(String).join(" "));
  console.error = capture;
  console.warn = capture;
  console.log = capture;
  try { await run(lines); } finally {
    console.error = original.error;
    console.warn = original.warn;
    console.log = original.log;
  }
}

function assertSafeSurfaces(responses: string[], logs: string[], rpcArgs: Record<string, unknown>[]) {
  for (const response of responses.slice(0, 2)) {
    assertEquals(JSON.parse(response), { error: "Auth email dispatch incomplete" });
  }
  if (responses.length === 3) assertEquals(JSON.parse(responses[2]), { success: true });
  const exposed = [...responses, ...logs, JSON.stringify(rpcArgs)].join("\n");
  for (const sentinel of [
    "private-current-token", "private-current-hash", "private-new-token", "private-new-hash",
    "current@example.test", "next@example.test", "synthetic-user", "synthetic-brevo-key",
    "provider-body-sentinel", "provider-throw-sentinel",
  ]) assertEquals(exposed.includes(sentinel), false, `sensitive sentinel leaked: ${sentinel}`);
  for (const args of rpcArgs) {
    assertEquals(Object.keys(args).sort(), "p_outcome" in args
      ? ["p_attempt_token", "p_http_status", "p_outcome", "p_result_code", "p_slot", "p_webhook_id"]
      : ["p_attempt_token", "p_slot", "p_webhook_id"]);
  }
  for (const line of logs) {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    assertEquals(Object.keys(parsed).sort(), ["code", "fn", "level", "msg", "ts"]);
    assertEquals(parsed.fn, "auth-email-hook");
    assertEquals(parsed.code, "dispatch_incomplete");
  }
}

Deno.test("signed partial 503 holds both slots and new ID with identical payload is independent", async () => {
  await captureConsole(async (logs) => network(async (sends, rpcArgs) => {
    const replay = signed("evt-partial", change);
    const first = await handler(replay());
    const second = await handler(replay());
    assertEquals([first.status, second.status], [500, 500]);
    assertEquals(sends, ["email_change_current", "email_change_new"]);
    const independent = await handler(signed("evt-independent", change)());
    assertEquals(independent.status, 200);
    assertEquals(sends, ["email_change_current", "email_change_new", "email_change_current", "email_change_new"]);
    assertEquals(logs.length, 2);
    assertSafeSurfaces([await first.text(), await second.text(), await independent.text()], logs, rpcArgs);
  }, async (_slot, ordinal) => new Response(ordinal === 2 ? "provider-body-sentinel" : null, { status: ordinal === 2 ? 503 : 201 })));
});

Deno.test("lost response holds new slot without resending accepted current", async () => {
  await captureConsole(async (logs) => network(async (sends, rpcArgs) => {
    const replay = signed("evt-lost", change);
    const first = await handler(replay());
    const second = await handler(replay());
    assertEquals([first.status, second.status], [500, 500]);
    assertEquals(sends, ["email_change_current", "email_change_new"]);
    assertEquals(logs.length, 2);
    assertSafeSurfaces([await first.text(), await second.text()], logs, rpcArgs);
  }, async (_slot, ordinal) => ordinal === 2 ? Promise.reject(new Error("provider-throw-sentinel")) : new Response(null, { status: 201 })));
});

Deno.test("complete signed replay returns success without another provider send", async () => {
  await network(async (sends) => {
    const replay = signed("evt-complete", change);
    assertEquals((await handler(replay())).status, 200);
    assertEquals((await handler(replay())).status, 200);
    assertEquals(sends, ["email_change_current", "email_change_new"]);
  });
});

Deno.test("missing admission RPC fails closed with a generic response", async () => {
  const original = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === "https://api.brevo.com/v3/smtp/email") providerCalls++;
    return new Response("private-token", { status: 404 });
  };
  try {
    const response = await handler(signed("evt-missing-rpc", change)());
    assertEquals(response.status, 500);
    assertEquals(await response.json(), { error: "Auth email dispatch incomplete" });
    assertEquals(providerCalls, 0);
  } finally { globalThis.fetch = original; }
});

Deno.test("six actions and single-slot email change retain their slots", async () => {
  await network(async (sends) => {
    const actions = ["signup", "invite", "magiclink", "recovery", "reauthentication"];
    for (const action of actions) {
      const payload = { user: { id: "u", email: "current@example.test" }, email_data: {
        email_action_type: action, token: "private-token", token_hash: "private-hash", site_url: "https://example.test" } };
      assertEquals((await handler(signed(`evt-${action}`, payload)())).status, 200);
    }
    assertEquals((await handler(signed("evt-current-only", { ...change,
      user: { id: "u", email: "current@example.test" },
      email_data: { ...change.email_data, token_hash: undefined } })())).status, 200);
    assertEquals((await handler(signed("evt-new-only", { ...change,
      user: { id: "u", new_email: "next@example.test" },
      email_data: { ...change.email_data, token_hash_new: undefined } })())).status, 200);
    assertEquals(sends, [...actions, "email_change_current", "email_change_new"]);
  });
});

Deno.test("tampered signature has no admission or provider effect", async () => {
  await network(async (sends, rpcArgs) => {
    const valid = signed("evt-valid", change)();
    const tampered = new Request(valid, { headers: { ...Object.fromEntries(valid.headers), "webhook-id": "evt-tampered" } });
    assertEquals((await handler(tampered)).status, 401);
    assertEquals(sends, []);
    assertEquals(rpcArgs, []);
  });
});

Deno.test("OPTIONS and authorized or unauthorized preview have zero admission and provider effects", async () => {
  await network(async (sends, rpcArgs) => {
    const url = "https://functions.supabase.co/auth-email-hook/preview";
    assertEquals((await handler(new Request(url, { method: "OPTIONS" }))).status, 200);
    assertEquals((await handler(new Request(url, { method: "POST", body: JSON.stringify({ type: "signup" }),
      headers: { authorization: "Bearer wrong-preview-secret" } }))).status, 401);
    assertEquals((await handler(new Request(url, { method: "POST", body: JSON.stringify({ type: "signup" }),
      headers: { authorization: `Bearer v1,whsec_${signingKey}` } }))).status, 200);
    assertEquals(sends, []);
    assertEquals(rpcArgs, []);
  });
});

Deno.test("missing and oversized signed identity have zero admission and provider effects", async () => {
  await network(async (sends, rpcArgs) => {
    const valid = signed("evt-identity", change)();
    const missingHeaders = new Headers(valid.headers);
    missingHeaders.delete("webhook-id");
    assertEquals((await handler(new Request(valid, { headers: missingHeaders }))).status, 401);
    const oversized = signed("x".repeat(513), change);
    const rejected = await handler(oversized());
    assertEquals(rejected.status, 500);
    assertEquals(await rejected.json(), { error: "Auth email dispatch incomplete" });
    assertEquals(sends, []);
    assertEquals(rpcArgs, []);
  });
});

Deno.test("missing service or Brevo configuration has zero admission and provider effects", async () => {
  await network(async (sends, rpcArgs) => {
    for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "BREVO_FROM_EMAIL", "BREVO_API_KEY"]) {
      const prior = Deno.env.get(key);
      Deno.env.delete(key);
      try {
        const response = await handler(signed(`evt-missing-${key}`, change)());
        assertEquals(response.status, 500);
        assertEquals(await response.json(), { error: "Auth email dispatch incomplete" });
      } finally {
        if (prior !== undefined) Deno.env.set(key, prior);
      }
    }
    assertEquals(sends, []);
    assertEquals(rpcArgs, []);
  });
});

restore();
