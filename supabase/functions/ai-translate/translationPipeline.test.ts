import {
  assert,
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  mapConcurrentFailClosed,
  TranslationDeadlineError,
} from "./translationPipeline.ts";

Deno.test("translation workers preserve order while enforcing bounded concurrency", async () => {
  let active = 0;
  let maxActive = 0;
  const controller = new AbortController();

  const results = await mapConcurrentFailClosed({
    items: Array.from({ length: 12 }, (_, index) => index),
    concurrency: 4,
    signal: controller.signal,
    task: async (value) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return value * 2;
    },
  });

  assertEquals(results, Array.from({ length: 12 }, (_, index) => index * 2));
  assertEquals(maxActive, 4);
});

Deno.test("translation workers abort outstanding work at the overall deadline", async () => {
  let aborted = 0;
  const startedAt = performance.now();
  const controller = new AbortController();
  const deadlineError = new TranslationDeadlineError();
  const deadlineTimer = setTimeout(() => controller.abort(deadlineError), 25);

  try {
    await assertRejects(
      () =>
        mapConcurrentFailClosed({
          items: Array.from({ length: 20 }, (_, index) => index),
          concurrency: 3,
          signal: controller.signal,
          task: (_value, _index, signal) =>
            new Promise<number>((_resolve, reject) => {
              signal.addEventListener("abort", () => {
                aborted += 1;
                reject(signal.reason);
              }, { once: true });
            }),
        }),
      TranslationDeadlineError,
    );
  } finally {
    clearTimeout(deadlineTimer);
  }

  assertEquals(aborted, 3);
  assert(performance.now() - startedAt < 500);
});
