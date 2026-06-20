/**
 * Deno unit tests for the shared response builders.
 * Run: deno test supabase/functions/_shared/response.test.ts
 */
import { assertEquals, assertStrictEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { jsonResponse, errorResponse, unavailableResponse } from "./response.ts";

// ── jsonResponse ──────────────────────────────────────────────────────────────

Deno.test("jsonResponse: defaults to status 200", () => {
  const res = jsonResponse({ ok: true });
  assertStrictEquals(res.status, 200);
});

Deno.test("jsonResponse: sets Content-Type application/json", () => {
  const res = jsonResponse({ ok: true });
  assertStrictEquals(res.headers.get("Content-Type"), "application/json");
});

Deno.test("jsonResponse: serialises body correctly", async () => {
  const res = jsonResponse({ name: "maiprop", count: 3 });
  const body = await res.json();
  assertEquals(body, { name: "maiprop", count: 3 });
});

Deno.test("jsonResponse: honours custom status code", () => {
  const res = jsonResponse({ created: true }, 201);
  assertStrictEquals(res.status, 201);
});

Deno.test("jsonResponse: merges extra headers", () => {
  const res = jsonResponse({}, 200, { "X-Custom": "hello" });
  assertStrictEquals(res.headers.get("X-Custom"), "hello");
  assertStrictEquals(res.headers.get("Content-Type"), "application/json");
});

// ── errorResponse ─────────────────────────────────────────────────────────────

Deno.test("errorResponse: defaults to status 500", () => {
  const res = errorResponse("boom");
  assertStrictEquals(res.status, 500);
});

Deno.test("errorResponse: body has error key with the message", async () => {
  const res = errorResponse("not found", 404);
  const body = await res.json();
  assertStrictEquals(body.error, "not found");
});

Deno.test("errorResponse: body includes a stable machine-readable code", async () => {
  const res = errorResponse("bad input", 400);
  const body = await res.json();
  assertEquals(body, { error: "bad input", code: "bad_request" });
});

Deno.test("errorResponse: forwards validation issues in the standard envelope", async () => {
  const res = errorResponse("Invalid request body", 400, {}, {
    code: "validation_error",
    issues: [{ code: "invalid_type", path: ["email"], message: "Invalid email" }],
  });
  const body = await res.json();
  assertEquals(body, {
    error: "Invalid request body",
    code: "validation_error",
    issues: [{ code: "invalid_type", path: ["email"], message: "Invalid email" }],
  });
});

Deno.test("errorResponse: custom status is reflected", () => {
  const res = errorResponse("bad input", 400);
  assertStrictEquals(res.status, 400);
});

Deno.test("errorResponse: extra headers are forwarded", () => {
  const cors = { "Access-Control-Allow-Origin": "https://maiprop.co" };
  const res = errorResponse("oops", 500, cors);
  assertStrictEquals(res.headers.get("Access-Control-Allow-Origin"), "https://maiprop.co");
});

// ── unavailableResponse ───────────────────────────────────────────────────────

Deno.test("unavailableResponse: returns 503", () => {
  const res = unavailableResponse();
  assertStrictEquals(res.status, 503);
});

Deno.test("unavailableResponse: body has available:false and default reason", async () => {
  const res = unavailableResponse();
  const body = await res.json();
  assertStrictEquals(body.available, false);
  assertStrictEquals(body.reason, "upstream_unavailable");
});

Deno.test("unavailableResponse: custom reason is preserved", async () => {
  const res = unavailableResponse("not_configured");
  const body = await res.json();
  assertStrictEquals(body.reason, "not_configured");
});

Deno.test("unavailableResponse: extra headers are forwarded", () => {
  const cors = { "Access-Control-Allow-Origin": "https://maiprop.co" };
  const res = unavailableResponse("upstream_unavailable", cors);
  assertStrictEquals(res.headers.get("Access-Control-Allow-Origin"), "https://maiprop.co");
});
