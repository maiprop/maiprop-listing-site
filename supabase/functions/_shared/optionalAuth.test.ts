import { assertEquals, assertLess } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveOptionalUserId } from "./optionalAuth.ts";

Deno.test("optional auth returns a verified user id", async () => {
  const id = await resolveOptionalUserId("token", async () => ({
    data: { user: { id: "user-1" } },
  }));
  assertEquals(id, "user-1");
});

Deno.test("optional auth degrades to anonymous on rejection", async () => {
  const id = await resolveOptionalUserId("token", async () => {
    throw new Error("auth unavailable");
  });
  assertEquals(id, null);
});

Deno.test("optional auth bounds a stalled lookup", async () => {
  const started = performance.now();
  const id = await resolveOptionalUserId(
    "token",
    () => new Promise(() => undefined),
    20,
  );
  assertEquals(id, null);
  assertLess(performance.now() - started, 200);
});
