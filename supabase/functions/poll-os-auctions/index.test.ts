/**
 * Tests for poll-os-auctions edge function (cron/internal).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");
const {
  authorizeSyncRequest,
  isCronBearerRequest,
} = await import("./index.ts");

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("non-POST requests never run sync work", async () => {
  const res = await handler(req("GET", undefined, {
    authorization: `Bearer ${Deno.env.get("CRON_SECRET")}`,
  }));
  assertEquals(res.status, 405);
});

Deno.test("POST without credentials is rejected before sync work starts", async () => {
  const res = await handler(req("POST", {}));
  assertEquals(res.status, 401);
});

Deno.test("cron authorization requires the exact bearer secret, not spoofable headers", async () => {
  const spoofedHeader = req("POST", {}, {
    "x-forwarded-for": "127.0.0.1",
    "x-maiprop-cron": "true",
  });
  assertEquals(await isCronBearerRequest(spoofedHeader), false);

  const wrongBearer = req("POST", {}, {
    authorization: "Bearer wrong-secret",
    "x-forwarded-for": "127.0.0.1",
  });
  assertEquals(await isCronBearerRequest(wrongBearer), false);

  const validBearer = req("POST", {}, {
    authorization: `Bearer ${Deno.env.get("CRON_SECRET")}`,
  });
  assertEquals(await isCronBearerRequest(validBearer), true);
});

Deno.test("cron authorization does not call Supabase Auth when bearer secret matches", async () => {
  let getUserCalls = 0;
  const sb = {
    auth: {
      getUser() {
        getUserCalls += 1;
        return Promise.resolve({ data: { user: null }, error: { message: "should not be called" } });
      },
    },
    from() {
      throw new Error("profile lookup should not be called for cron");
    },
  };

  const result = await authorizeSyncRequest(
    req("POST", {}, { authorization: `Bearer ${Deno.env.get("CRON_SECRET")}` }),
    sb as never,
    {},
  );

  assertEquals(result instanceof Response, false);
  assertEquals("kind" in result && result.kind, "cron");
  assertEquals(getUserCalls, 0);
});

restore();
