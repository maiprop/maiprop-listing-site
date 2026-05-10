/**
 * Tests for os-diagnose edge function (admin only).
 */
import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req, authedReq } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("missing auth returns 401 or 403", async () => {
  const res = await handler(req("POST"));
  assertEquals([401, 403].includes(res.status), true);
});

Deno.test("fake Bearer returns auth/permission error", async () => {
  const res = await handler(authedReq("POST"));
  assertEquals([401, 403, 500].includes(res.status), true);
});

Deno.test("error responses never contain upstream auth JSON bodies", async () => {
  const res = await handler(authedReq("POST"));
  const body = await res.text();
  // Error body must not contain common auth response field names that
  // would indicate raw upstream JSON was echoed to the caller.
  assertNotEquals(body.includes("\"password\""), true, "response must not contain password field");
  assertNotEquals(body.includes("\"accessToken\""), true, "response must not echo accessToken");
  assertNotEquals(body.includes("\"refresh_token\""), true, "response must not echo refresh_token");
});

restore();
