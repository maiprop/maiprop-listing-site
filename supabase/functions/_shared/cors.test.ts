/**
 * Deno unit tests for the shared CORS helper.
 * Run: deno test supabase/functions/_shared/cors.test.ts
 */
import { assertEquals, assertStrictEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getCorsHeaders, handleCors } from "./cors.ts";

function withEnvironment(
  environment: string | undefined,
  callback: () => void,
): void {
  const original = Deno.env.get("ENVIRONMENT");
  try {
    if (environment === undefined) Deno.env.delete("ENVIRONMENT");
    else Deno.env.set("ENVIRONMENT", environment);
    callback();
  } finally {
    if (original === undefined) Deno.env.delete("ENVIRONMENT");
    else Deno.env.set("ENVIRONMENT", original);
  }
}

// ── getCorsHeaders ────────────────────────────────────────────────────────────

Deno.test("getCorsHeaders: reflects an allowed origin", () => {
  const req = new Request("https://maiprop.co/api", {
    headers: { origin: "https://maiprop.co" },
  });
  const headers = getCorsHeaders(req);
  assertStrictEquals(headers["Access-Control-Allow-Origin"], "https://maiprop.co");
});

Deno.test("getCorsHeaders: reflects portal.maiprop.co (live production domain)", () => {
  const req = new Request("https://portal.maiprop.co/api", {
    headers: { origin: "https://portal.maiprop.co" },
  });
  const headers = getCorsHeaders(req);
  assertStrictEquals(headers["Access-Control-Allow-Origin"], "https://portal.maiprop.co");
});

Deno.test("getCorsHeaders: reflects a localhost dev origin", () => {
  const req = new Request("http://localhost:8080/api", {
    headers: { origin: "http://localhost:8080" },
  });
  const headers = getCorsHeaders(req);
  assertStrictEquals(headers["Access-Control-Allow-Origin"], "http://localhost:8080");
});

Deno.test("getCorsHeaders: falls back to production origin for unknown origin", () => {
  const req = new Request("https://evil.example.com/api", {
    headers: { origin: "https://evil.example.com" },
  });
  const headers = getCorsHeaders(req);
  assertStrictEquals(headers["Access-Control-Allow-Origin"], "https://maiprop.co");
});

Deno.test("getCorsHeaders: falls back when no origin header is present", () => {
  const req = new Request("https://maiprop.co/api");
  const headers = getCorsHeaders(req);
  assertStrictEquals(headers["Access-Control-Allow-Origin"], "https://maiprop.co");
});

Deno.test("getCorsHeaders: always includes Vary: Origin", () => {
  const req = new Request("https://maiprop.co/api", {
    headers: { origin: "https://maiprop.co" },
  });
  const headers = getCorsHeaders(req);
  assertStrictEquals(headers["Vary"], "Origin");
});

Deno.test("getCorsHeaders: includes required CORS allow-headers string", () => {
  const req = new Request("https://maiprop.co/api");
  const headers = getCorsHeaders(req);
  assertEquals(typeof headers["Access-Control-Allow-Headers"], "string");
  assertEquals(headers["Access-Control-Allow-Headers"].includes("authorization"), true);
  assertEquals(headers["Access-Control-Allow-Headers"].includes("content-type"), true);
});

Deno.test("getCorsHeaders: includes baggage and sentry-trace in allowed headers", () => {
  const req = new Request("https://maiprop.co/api");
  const headers = getCorsHeaders(req);
  assertEquals(headers["Access-Control-Allow-Headers"].includes("baggage"), true);
  assertEquals(headers["Access-Control-Allow-Headers"].includes("sentry-trace"), true);
});

Deno.test("getCorsHeaders: reflects Cloudflare Pages preview origin", () => {
  const req = new Request("https://maiprop.co/api", {
    headers: { origin: "https://fix-pr-review-findings.maiprop-listing-site.pages.dev" },
  });
  const headers = getCorsHeaders(req);
  assertStrictEquals(
    headers["Access-Control-Allow-Origin"],
    "https://fix-pr-review-findings.maiprop-listing-site.pages.dev",
  );
});

Deno.test("getCorsHeaders: reflects CF Pages preview with hash slug", () => {
  const req = new Request("https://maiprop.co/api", {
    headers: { origin: "https://abc123.maiprop-listing-site.pages.dev" },
  });
  const headers = getCorsHeaders(req);
  assertStrictEquals(
    headers["Access-Control-Allow-Origin"],
    "https://abc123.maiprop-listing-site.pages.dev",
  );
});

Deno.test("getCorsHeaders: rejects other .pages.dev projects", () => {
  const req = new Request("https://maiprop.co/api", {
    headers: { origin: "https://evil-project.pages.dev" },
  });
  const headers = getCorsHeaders(req);
  assertStrictEquals(headers["Access-Control-Allow-Origin"], "https://maiprop.co");
});

Deno.test("getCorsHeaders: staging permits its canonical Cloudflare Pages origin", () => {
  withEnvironment("staging", () => {
    const origin = "https://maiprop-listing-site-staging.pages.dev";
    const headers = getCorsHeaders(
      new Request("https://functions.example", {
        headers: { origin },
      }),
    );
    assertStrictEquals(headers["Access-Control-Allow-Origin"], origin);
  });
});

Deno.test("getCorsHeaders: staging permits only hash previews of its Pages project", () => {
  withEnvironment("staging", () => {
    const allowedOrigin =
      "https://56f85fcd.maiprop-listing-site-staging.pages.dev";
    const allowedHeaders = getCorsHeaders(
      new Request("https://functions.example", {
        headers: { origin: allowedOrigin },
      }),
    );
    assertStrictEquals(
      allowedHeaders["Access-Control-Allow-Origin"],
      allowedOrigin,
    );

    for (
      const rejectedOrigin of [
        "https://feature.maiprop-listing-site-staging.pages.dev",
        "https://56f85fcd.evil-project.pages.dev",
        "https://56f85fcd.maiprop-listing-site-staging.pages.dev.evil.example",
      ]
    ) {
      const rejectedHeaders = getCorsHeaders(
        new Request("https://functions.example", {
          headers: { origin: rejectedOrigin },
        }),
      );
      assertStrictEquals(
        rejectedHeaders["Access-Control-Allow-Origin"],
        "https://maiprop.co",
      );
    }
  });
});

Deno.test("getCorsHeaders: production rejects staging Pages origins", () => {
  withEnvironment("production", () => {
    for (
      const origin of [
        "https://maiprop-listing-site-staging.pages.dev",
        "https://56f85fcd.maiprop-listing-site-staging.pages.dev",
      ]
    ) {
      const headers = getCorsHeaders(
        new Request("https://functions.example", {
          headers: { origin },
        }),
      );
      assertStrictEquals(
        headers["Access-Control-Allow-Origin"],
        "https://maiprop.co",
      );
    }
  });
});

// ── handleCors ────────────────────────────────────────────────────────────────

Deno.test("handleCors: returns Response for OPTIONS request", () => {
  const req = new Request("https://maiprop.co/api", {
    method: "OPTIONS",
    headers: { origin: "https://maiprop.co" },
  });
  const result = handleCors(req);
  assertEquals(result instanceof Response, true);
  assertStrictEquals((result as Response).status, 200);
});

Deno.test("handleCors: OPTIONS response carries correct Allow-Origin", async () => {
  const req = new Request("https://maiprop.co/api", {
    method: "OPTIONS",
    headers: { origin: "https://app.maiprop.co" },
  });
  const result = handleCors(req) as Response;
  assertStrictEquals(result.headers.get("Access-Control-Allow-Origin"), "https://app.maiprop.co");
  assertStrictEquals(await result.text(), "ok");
});

Deno.test("handleCors: returns null for non-OPTIONS requests", () => {
  for (const method of ["GET", "POST", "PUT", "DELETE"]) {
    const req = new Request("https://maiprop.co/api", { method });
    assertStrictEquals(handleCors(req), null);
  }
});
