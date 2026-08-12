/**
 * Tests for fetch-report-from-os edge function.
 */
import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { authedReq, captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
);
const reportModule = await import("./index.ts");

Deno.test("external provider deadlines keep report generation bounded", () => {
  assertEquals(reportModule.OS_TOKEN_TIMEOUT_MS <= 7_000, true);
  assertEquals(reportModule.OS_HTML_REPORT_TIMEOUT_MS <= 25_000, true);
  assertEquals(reportModule.OS_AI_REPORT_TIMEOUT_MS <= 4_000, true);
});

Deno.test("OS report providers use response ceilings matched to payload type", () => {
  assertEquals(reportModule.OS_TOKEN_RESPONSE_MAX_BYTES, 64 * 1_024);
  assertEquals(
    reportModule.OS_HTML_REPORT_RESPONSE_MAX_BYTES,
    5 * 1_024 * 1_024,
  );
  assertEquals(
    reportModule.OS_AI_REPORT_RESPONSE_MAX_BYTES,
    1 * 1_024 * 1_024,
  );
  assertEquals(
    reportModule.OS_GENERIC_REPORT_RESPONSE_MAX_BYTES,
    5 * 1_024 * 1_024,
  );
});

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("non-POST requests are rejected without consuming their body", async () => {
  const request = new Request(
    "https://functions.supabase.co/fetch-report-from-os",
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "{",
    },
  );

  const res = await handler(request);

  assertEquals(res.status, 405);
  assertEquals(request.bodyUsed, false);
});

Deno.test("missing auth returns 401", async () => {
  const res = await handler(req("POST", { report_id: "rpt_123" }));
  assertEquals([401, 403].includes(res.status), true);
});

Deno.test("missing auth is rejected without consuming malformed JSON", async () => {
  const request = new Request(
    "https://functions.supabase.co/fetch-report-from-os",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    },
  );

  const res = await handler(request);

  assertEquals(res.status, 401);
  assertEquals(request.bodyUsed, false);
});

Deno.test("OS provider deadline includes a stalled response body", async () => {
  const fetchWithTimeout = (
    reportModule as unknown as {
      fetchWithTimeout?: (
        url: string,
        init: RequestInit,
        timeoutMs: number,
      ) => Promise<Response>;
    }
  ).fetchWithTimeout;
  assertEquals(typeof fetchWithTimeout, "function");
  if (!fetchWithTimeout) return;

  const originalFetch = globalThis.fetch;
  let cancelled = false;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(
        new ReadableStream<Uint8Array>({
          pull: () => new Promise<void>(() => undefined),
          cancel: () => {
            cancelled = true;
          },
        }),
      ),
    )) as typeof fetch;

  try {
    const startedAt = Date.now();
    const error = await assertRejects(
      () => fetchWithTimeout("https://os.test/stalled", {}, 20),
      Error,
    );
    assertEquals(error.name, "AbortError");
    assertEquals(Date.now() - startedAt < 250, true);
    assertEquals(cancelled, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("OS report streaming responses reject the configured byte ceiling", async () => {
  const fetchWithLimit = reportModule.fetchWithTimeout as unknown as (
    url: string,
    init: RequestInit,
    timeoutMs: number,
    maxResponseBytes: number,
  ) => Promise<Response>;
  const originalFetch = globalThis.fetch;
  let cancelled = false;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(5));
          },
          cancel() {
            cancelled = true;
          },
        }),
      ),
    )) as typeof fetch;

  try {
    const error = await assertRejects(
      () => fetchWithLimit("https://os.test/oversized", {}, 1_000, 4),
      Error,
    ) as Error & { code?: string };
    assertEquals(error.name, "ProviderResponseTooLargeError");
    assertEquals(error.code, "provider_response_too_large");
    assertEquals(cancelled, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("fake Bearer returns auth error (not crash)", async () => {
  const res = await handler(authedReq("POST", { report_id: "rpt_123" }));
  assertEquals([401, 403, 500].includes(res.status), true);
  const body = await res.json();
  assertEquals(typeof body.error, "string");
});

Deno.test("rejects non-database listing ids before contacting the report provider", async () => {
  const originalFetch = globalThis.fetch;
  let providerCalled = false;

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ user: { id: "user-1" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("os.test")) providerCalled = true;
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      listing_id: "external-listing-1",
      report_type: "valuation",
    }, { authorization: "Bearer valid-token" }));

    assertEquals(res.status, 400);
    assertEquals(providerCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("does not return a cached report for a listing hidden by caller RLS", async () => {
  const originalFetch = globalThis.fetch;
  let cacheRead = false;
  let providerCalled = false;

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ user: { id: "user-1" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (
      url.includes("/rest/v1/rpc/get_public_listing_catalogue") ||
      url.includes("/rest/v1/rpc/get_listing_management_catalogue")
    ) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/property_report_cache")) {
      cacheRead = true;
      return new Response(
        JSON.stringify([{
          id: "cache-private",
          listing_id: "11111111-1111-4111-8111-111111111111",
          report_type: "valuation",
          lang: "en",
          source: "os",
          html: "private report",
          ai: null,
          features: {},
          file_name: "private.html",
          generated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        }]),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    if (url.includes("os.test")) providerCalled = true;
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      listing_id: "11111111-1111-4111-8111-111111111111",
      report_type: "valuation",
    }, { authorization: "Bearer valid-token" }));

    assertEquals(res.status, 404);
    assertEquals(cacheRead, false);
    assertEquals(providerCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("denies an ineligible user before checking provider configuration", async () => {
  const originalFetch = globalThis.fetch;
  let authorizationChecked = false;

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ user: { id: "user-1" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/property_report_cache")) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/rpc/get_public_listing_catalogue")) {
      return new Response(
        JSON.stringify([{
          id: "11111111-1111-4111-8111-111111111111",
          city: "Athens",
          address: "Kolonaki 12",
          latitude: 37.981,
          longitude: 23.735,
          sqm: 95,
          property_type: "apartment",
          floor: 4,
          year_built: 2010,
        }]),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    if (url.includes("/rest/v1/rpc/authorize_property_report_generation")) {
      authorizationChecked = true;
      return new Response(JSON.stringify({ message: "report_not_allowed" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      listing_id: "11111111-1111-4111-8111-111111111111",
      report_type: "valuation",
    }, { authorization: "Bearer valid-token" }));

    assertEquals(authorizationChecked, true);
    assertEquals(res.status, 402);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("valuation HTML reports are sanitized before returning to the browser", async () => {
  const originalFetch = globalThis.fetch;
  let reportChargePayload: Record<string, unknown> | null = null;
  const listingId = "11111111-1111-4111-8111-111111111111";

  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ user: { id: "user-1", email: "user@test.local" } }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    }
    if (url === "https://os.test/auth/login") {
      return Promise.resolve(
        new Response(JSON.stringify({ data: { token: "os-token" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.startsWith("https://os.test/api/v1/reports/valuation/property?")) {
      return Promise.resolve(
        new Response(
          `
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
      `,
          { status: 200, headers: { "Content-Type": "text/html" } },
        ),
      );
    }
    if (
      url.startsWith("https://os.test/api/v1/reports/valuation/property/ai?")
    ) {
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.includes("/rest/v1/rpc/charge_property_report_fetch_for_user")) {
      const request = input instanceof Request ? input : null;
      const requestBody = request
        ? await request.clone().text()
        : typeof init?.body === "string"
        ? init.body
        : null;
      reportChargePayload = requestBody
        ? JSON.parse(requestBody) as Record<string, unknown>
        : null;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            charged: true,
            alreadyPaid: false,
            usage_id: "usage-1",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    }
    if (url.includes("/rest/v1/rpc/authorize_property_report_generation")) {
      return Promise.resolve(
        new Response(JSON.stringify({ allowed: true, source: "included" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.includes("/rest/v1/rpc/claim_property_report_generation")) {
      return Promise.resolve(
        new Response(JSON.stringify(true), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.includes("/rest/v1/rpc/release_property_report_generation")) {
      return Promise.resolve(
        new Response(JSON.stringify(true), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.includes("/rest/v1/rpc/store_property_report_cache_generation")) {
      const generatedAt = new Date().toISOString();
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: "cache-1",
            listing_id: listingId,
            report_type: "valuation",
            lang: "en",
            source: "os",
            html: "cached",
            ai: null,
            features: {},
            file_name: "report.html",
            generated_at: generatedAt,
            expires_at: new Date(Date.now() + 86_400_000).toISOString(),
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    }
    if (url.includes("/rest/v1/property_report_cache")) {
      const method = input instanceof Request
        ? input.method
        : init?.method ?? "GET";
      if (method === "GET") {
        return Promise.resolve(
          new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      const generatedAt = new Date().toISOString();
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: "cache-1",
            listing_id: listingId,
            report_type: "valuation",
            lang: "en",
            source: "os",
            html: "cached",
            ai: null,
            features: {},
            file_name: "report.html",
            generated_at: generatedAt,
            expires_at: new Date(Date.now() + 86_400_000).toISOString(),
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    }
    if (url.includes("/rest/v1/rpc/get_public_listing_catalogue")) {
      return Promise.resolve(
        new Response(
          JSON.stringify([{
            id: listingId,
            city: "Athens",
            address: "Kolonaki 12",
            latitude: 37.981,
            longitude: 23.735,
            sqm: 95,
            property_type: "apartment",
            floor: 4,
            year_built: 2010,
          }]),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    }
    if (url.includes("/rest/v1/usage_property_reports")) {
      throw new Error(
        "property-report usage must be charged through the entitlement RPC",
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      listing_id: listingId,
      report_type: "valuation",
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
    const capturedCharge = reportChargePayload as
      | Record<string, unknown>
      | null;
    assertEquals(capturedCharge?.["p_user_id"], "user-1");
    assertEquals(capturedCharge?.["p_listing_id"], listingId);
    assertEquals(typeof capturedCharge?.["p_cache_generated_at"], "string");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

restore();
