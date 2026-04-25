/**
 * Deno unit tests for the shared CORS helper.
 * Run: deno test supabase/functions/_shared/cors.test.ts
 */
import { assertEquals, assertStrictEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getCorsHeaders, handleCors } from "./cors.ts";

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
