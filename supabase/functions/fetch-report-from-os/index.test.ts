/**
 * Tests for fetch-report-from-os edge function.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req, authedReq } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("missing auth returns 401", async () => {
  const res = await handler(req("POST", { report_id: "rpt_123" }));
  assertEquals([401, 403].includes(res.status), true);
});

Deno.test("fake Bearer returns auth error (not crash)", async () => {
  const res = await handler(authedReq("POST", { report_id: "rpt_123" }));
  assertEquals([401, 403, 500].includes(res.status), true);
  const body = await res.json();
  assertEquals(typeof body.error, "string");
});

Deno.test("valuation HTML reports are sanitized before returning to the browser", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(new Response(JSON.stringify({ user: { id: "user-1", email: "user@test.local" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    }
    if (url === "https://os.test/auth/login") {
      return Promise.resolve(new Response(JSON.stringify({ data: { token: "os-token" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    }
    if (url.startsWith("https://os.test/api/v1/reports/valuation/property?")) {
      return Promise.resolve(new Response(`
        <html>
          <head><title>OS Report</title></head>
          <body onload="steal()">
            <a href="javascript:steal()">bad</a>
            <img src="https://cdn.example/report.png" onerror="steal()" />
            <script>steal()</script>
            <object data="https://evil.example/payload"></object>
            Report
          </body>
        </html>
      `, { status: 200, headers: { "Content-Type": "text/html" } }));
    }
    if (url.startsWith("https://os.test/api/v1/reports/valuation/property/ai?")) {
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    }
    if (url.includes("/rest/v1/usage_property_reports")) {
      return Promise.resolve(new Response(JSON.stringify({ id: "usage-1" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }));
    }
    return Promise.resolve(new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      listing_id: "external-listing-1",
      report_type: "valuation",
      listing: {
        id: "external-listing-1",
        city: "Athens",
        address: "Kolonaki 12",
        latitude: 37.981,
        longitude: 23.735,
        sqm: 95,
        property_type: "apartment",
        floor: 4,
        year_built: 2010,
      },
    }, { authorization: "Bearer valid-token" }));
    const body = await res.json() as { report?: { html?: string } };
    const html = body.report?.html ?? "";

    assertEquals(res.status, 200);
    assertEquals(html.includes("<script"), false);
    assertEquals(html.includes("onload="), false);
    assertEquals(html.includes("onerror="), false);
    assertEquals(html.includes("javascript:"), false);
    assertEquals(html.includes("<object"), false);
    assertEquals(html.includes("Content-Security-Policy"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

restore();
