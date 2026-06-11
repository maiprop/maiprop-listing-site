/**
 * Tests for pro-ai-tools edge function.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req, authedReq } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://maiprop.co");
});

Deno.test("missing auth returns 401", async () => {
  const res = await handler(req("POST", { messages: [], groupId: "legal" }));
  assertEquals(res.status, 401);
});

Deno.test("fake Bearer returns 401 (not 500)", async () => {
  const res = await handler(authedReq("POST", { messages: [], groupId: "agents" }));
  assertEquals([401, 429].includes(res.status), true);
});

Deno.test("pro assistant sends vetted prompt rules to the provider", async () => {
  const originalFetch = globalThis.fetch;
  let systemPrompt = "";

  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(new Response(JSON.stringify({
        user: { id: "test-user-id", email: "user@test.local" },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    }
    if (url.includes("api.openai.com")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      systemPrompt = String(body.messages?.[0]?.content ?? "");
      return Promise.resolve(new Response("data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\n\ndata: [DONE]\n\n", {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }));
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      groupId: "legal",
      messages: [{ role: "user", content: "Can I rely on this title?" }],
    }, { authorization: "Bearer test-valid-token" }));

    assertEquals(res.status, 200);
    assertEquals(systemPrompt.includes("Current date:"), true);
    assertEquals(systemPrompt.includes("Cross-check internally before answering"), true);
    assertEquals(systemPrompt.includes("Never cite, imply, or fabricate sources you have not actually used"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

restore();
