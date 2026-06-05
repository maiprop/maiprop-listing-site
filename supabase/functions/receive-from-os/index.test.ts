/**
 * Tests for receive-from-os edge function (HMAC-verified OS webhook).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("missing HMAC signature returns 401 or 400", async () => {
  const res = await handler(req("POST", { type: "auction.updated", data: {} }));
  // Without valid HMAC signature, webhook should reject
  assertEquals([400, 401, 403].includes(res.status), true);
});

Deno.test("wrong HMAC returns error response", async () => {
  const r = new Request("https://functions.supabase.co/fn", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-webhook-signature": "sha256=bad",
      "x-webhook-timestamp": String(Math.floor(Date.now() / 1000)),
    },
    body: JSON.stringify({ type: "auction.updated" }),
  });
  const res = await handler(r);
  assertEquals([400, 401, 403].includes(res.status), true);
});

async function signOsPayload(rawBody: string, secret: string): Promise<string> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  );
  const hmac = Array.from(new Uint8Array(sigBytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `t=${timestamp},v1=${hmac}`;
}

Deno.test("valid x-os-signature reaches webhook handler", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response("[]", {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }))) as typeof fetch;

  try {
    const rawBody = JSON.stringify({
      event: "upsert",
      entity_type: "unknown_entity",
      data: { id: "os-1" },
    });
    const signature = await signOsPayload(rawBody, "placeholder-os-webhook");
    const res = await handler(new Request("https://functions.supabase.co/fn", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-os-signature": signature,
      },
      body: rawBody,
    }));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.ok, true);
    assertEquals(body.status, "skipped");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

restore();
