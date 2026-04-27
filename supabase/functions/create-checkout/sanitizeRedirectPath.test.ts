/**
 * Unit tests for sanitizeRedirectPath — covers BUG C with full branch coverage.
 *
 * Lives in its own file so importing the helper does not trigger the module's
 * Deno.serve(...) call before testUtils.captureHandler can patch it (which
 * would break the handler-level integration tests in `index.test.ts`).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { sanitizeRedirectPath } from "./index.ts";

Deno.test("sanitizeRedirectPath: accepts a same-origin path", () => {
  assertEquals(sanitizeRedirectPath("/dashboard"), "/dashboard");
});

Deno.test("sanitizeRedirectPath: accepts a path with a query string", () => {
  assertEquals(
    sanitizeRedirectPath("/dashboard?pro=success&from=stripe"),
    "/dashboard?pro=success&from=stripe",
  );
});

Deno.test("sanitizeRedirectPath: rejects scheme-relative URLs (//evil.com)", () => {
  assertEquals(sanitizeRedirectPath("//evil.com/phish"), null);
});

Deno.test("sanitizeRedirectPath: rejects backslash-escape redirect (/\\evil)", () => {
  assertEquals(sanitizeRedirectPath("/\\evil.com"), null);
});

Deno.test("sanitizeRedirectPath: rejects absolute URLs", () => {
  assertEquals(sanitizeRedirectPath("https://evil.com/path"), null);
  assertEquals(sanitizeRedirectPath("http://attacker"), null);
});

Deno.test("sanitizeRedirectPath: rejects non-string inputs", () => {
  assertEquals(sanitizeRedirectPath(null), null);
  assertEquals(sanitizeRedirectPath(undefined), null);
  assertEquals(sanitizeRedirectPath(123), null);
  assertEquals(sanitizeRedirectPath({ foo: "bar" }), null);
  assertEquals(sanitizeRedirectPath(["/dashboard"]), null);
});

Deno.test("sanitizeRedirectPath: rejects empty string", () => {
  assertEquals(sanitizeRedirectPath(""), null);
});

Deno.test("sanitizeRedirectPath: rejects CRLF / control characters (header injection)", () => {
  assertEquals(sanitizeRedirectPath("/dashboard\r\nLocation: https://evil"), null);
  assertEquals(sanitizeRedirectPath("/dashboard\nfoo"), null);
  assertEquals(sanitizeRedirectPath("/dashboard\tfoo"), null);
});

Deno.test("sanitizeRedirectPath: rejects paths longer than 512 chars", () => {
  const longPath = "/" + "a".repeat(512);
  assertEquals(sanitizeRedirectPath(longPath), null);
  // 512-char path (slash + 511 chars) is allowed
  const exactPath = "/" + "a".repeat(511);
  assertEquals(sanitizeRedirectPath(exactPath), exactPath);
});

Deno.test("sanitizeRedirectPath: rejects paths not starting with /", () => {
  assertEquals(sanitizeRedirectPath("dashboard"), null);
  assertEquals(sanitizeRedirectPath("./dashboard"), null);
  assertEquals(sanitizeRedirectPath("../etc/passwd"), null);
});
