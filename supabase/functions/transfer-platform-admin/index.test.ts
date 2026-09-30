import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const callerId = "10000000-0000-4000-8000-000000000001";
const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function authorized(body: unknown): Request {
  return req("POST", body, { authorization: "Bearer test-token" });
}

Deno.test("admin transfer rejects preflight, method, unavailable service, and missing identity at their boundaries", async () => {
  assertEquals((await handler(req("OPTIONS"))).status, 200);
  assertEquals((await handler(req("GET"))).status, 405);
  Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  try {
    assertEquals((await handler(authorized({ targetEmail: "next@example.test" }))).status, 503);
  } finally {
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "placeholder-supabase-service-role");
  }
  assertEquals((await handler(req("POST", { targetEmail: "next@example.test" }))).status, 401);
});

Deno.test("admin transfer validates after verified auth and checks current authority before grant", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
  let isAdmin = true;
  let adminError = false;
  let grantError = false;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    if (url.origin !== "https://test.supabase.co") throw new Error(`unexpected host: ${url.origin}`);
    if (url.pathname === "/auth/v1/user" && request.method === "GET") {
      return json({ user: { id: callerId, email: "old@example.test" } });
    }
    if (url.pathname.startsWith("/rest/v1/rpc/") && request.method === "POST") {
      const body = await request.json() as Record<string, unknown>;
      calls.push({ path: url.pathname, body });
      if (url.pathname.endsWith("/has_platform_admin")) {
        return adminError ? json({ message: "authority unavailable" }, 500) : json(isAdmin);
      }
      if (url.pathname.endsWith("/grant_platform_admin_by_email_for_caller")) {
        return grantError ? json({ message: "grant unavailable" }, 500) : json(null);
      }
    }
    throw new Error(`unexpected transport: ${request.method} ${url.pathname}`);
  }) as typeof fetch;
  try {
    const malformed = new Request("https://functions.supabase.co/transfer-platform-admin", {
      method: "POST",
      headers: { authorization: "Bearer test-token", "content-type": "application/json" },
      body: "{",
    });
    assertEquals((await handler(malformed)).status, 400);
    assertEquals((await handler(authorized({ targetEmail: "invalid" }))).status, 400);
    assertEquals(calls, []);

    isAdmin = false;
    const forbidden = await handler(authorized({ targetEmail: " Next@Example.Test " }));
    assertEquals(forbidden.status, 403);
    assertEquals(await forbidden.json(), { error: "Forbidden" });
    assertEquals(calls, [{ path: "/rest/v1/rpc/has_platform_admin", body: { _user_id: callerId } }]);

    isAdmin = true;
    calls.length = 0;
    const success = await handler(authorized({ targetEmail: " Next@Example.Test " }));
    assertEquals(success.status, 200);
    assertEquals(await success.json(), { success: true });
    assertEquals(calls, [
      { path: "/rest/v1/rpc/has_platform_admin", body: { _user_id: callerId } },
      { path: "/rest/v1/rpc/grant_platform_admin_by_email_for_caller", body: {
        caller_user_id: callerId,
        target_email: "next@example.test",
      } },
    ]);

    isAdmin = false;
    calls.length = 0;
    assertEquals((await handler(authorized({ targetEmail: "next@example.test" }))).status, 403);
    assertEquals(calls.length, 1);

    isAdmin = true;
    adminError = true;
    calls.length = 0;
    assertEquals((await handler(authorized({ targetEmail: "next@example.test" }))).status, 500);
    assertEquals(calls.length, 1);
    adminError = false;
    grantError = true;
    calls.length = 0;
    assertEquals((await handler(authorized({ targetEmail: "next@example.test" }))).status, 500);
    assertEquals(calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

restore();
