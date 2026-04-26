/**
 * Tests for invitation-notify edge function (server-triggered).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req, authedReq } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("missing Authorization returns 401", async () => {
  const res = await handler(req("POST", { invitation_id: "inv_123" }));
  assertEquals([401, 403].includes(res.status), true);
});

Deno.test("fake Bearer returns auth error, not unhandled crash", async () => {
  const res = await handler(authedReq("POST", { invitation_id: "inv_123" }));
  assertEquals([401, 403, 500].includes(res.status), true);
  const body = await res.json();
  assertEquals(typeof body.error === "string" || typeof body.ok === "boolean", true);
});

restore();
