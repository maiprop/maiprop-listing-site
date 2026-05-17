/**
 * Tests for csp-report edge function.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts", {
  RATE_LIMIT_FORCE_MEMORY: "true",
});

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("GET returns 405", async () => {
  const res = await handler(req("GET"));
  assertEquals(res.status, 405);
});

Deno.test("POST with legacy report-uri body returns 204", async () => {
  const res = await handler(req("POST", {
    "csp-report": {
      "blocked-uri": "https://evil.example.com/script.js",
      "document-uri": "https://maiprop.co/listings",
      "violated-directive": "script-src",
    },
  }));
  assertEquals(res.status, 204);
});

Deno.test("POST with Reporting API array body returns 204", async () => {
  const res = await handler(req("POST", [
    {
      type: "csp-violation",
      url: "https://maiprop.co/",
      body: {
        blockedURL: "https://evil.example.com/script.js",
        documentURL: "https://maiprop.co/",
        effectiveDirective: "script-src",
      },
    },
  ]));
  assertEquals(res.status, 204);
});

Deno.test("POST with invalid JSON body still returns 204", async () => {
  const res = await handler(
    new Request("https://functions.supabase.co/fn", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://maiprop.co" },
      body: "not-json",
    }),
  );
  assertEquals(res.status, 204);
});

Deno.test("POST with oversized report body returns 413", async () => {
  const res = await handler(
    new Request("https://functions.supabase.co/fn", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://maiprop.co" },
      body: JSON.stringify({ "csp-report": { "blocked-uri": "x".repeat(17_000) } }),
    }),
  );
  assertEquals(res.status, 413);
});

restore();
