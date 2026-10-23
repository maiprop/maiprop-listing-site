/**
 * Deno unit tests for the shared async-budget race helper.
 * Run: deno test supabase/functions/_shared/fetchWithTimeout.test.ts
 */
import { assertEquals, assertStrictEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ASYNC_BUDGET_EXCEEDED, withAsyncBudget } from "./fetchWithTimeout.ts";

Deno.test("withAsyncBudget resolves fast work unchanged", async () => {
  assertEquals(await withAsyncBudget(Promise.resolve(42), 1000), 42);
  assertEquals(await withAsyncBudget(Promise.resolve("ok"), 1000), "ok");
});

Deno.test("withAsyncBudget keeps a legitimate null result unambiguous", async () => {
  const result = await withAsyncBudget(Promise.resolve(null), 1000);
  assertStrictEquals(result, null);
});

Deno.test("withAsyncBudget yields the sentinel when the budget expires", async () => {
  const result = await withAsyncBudget(new Promise<never>(() => {}), 10);
  assertStrictEquals(result, ASYNC_BUDGET_EXCEEDED);
});

Deno.test("withAsyncBudget propagates work rejection", async () => {
  let caught: unknown;
  try {
    await withAsyncBudget(Promise.reject(new Error("boom")), 1000);
  } catch (error) {
    caught = error;
  }
  assertEquals((caught as Error).message, "boom");
});
