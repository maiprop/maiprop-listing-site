export class TranslationDeadlineError extends Error {
  constructor(message = "Translation deadline exceeded") {
    super(message);
    this.name = "TranslationDeadlineError";
  }
}

type ConcurrentMapOptions<T, R> = {
  items: readonly T[];
  concurrency: number;
  signal: AbortSignal;
  task: (item: T, index: number, signal: AbortSignal) => Promise<R>;
};

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("Translation aborted", "AbortError");
}

async function runAbortable<T>(
  task: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) throw abortReason(signal);

  let removeAbortListener = () => {};
  const abortPromise = new Promise<never>((_resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    removeAbortListener = () => signal.removeEventListener("abort", onAbort);
  });

  try {
    return await Promise.race([task(), abortPromise]);
  } finally {
    removeAbortListener();
  }
}

export async function mapConcurrentFailClosed<T, R>({
  items,
  concurrency,
  signal,
  task,
}: ConcurrentMapOptions<T, R>): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError("translation concurrency must be a positive integer");
  }
  if (signal.aborted) throw abortReason(signal);
  if (items.length === 0) return [];

  const controller = new AbortController();
  const onUpstreamAbort = () => controller.abort(abortReason(signal));
  signal.addEventListener("abort", onUpstreamAbort, { once: true });
  const results = new Array<R>(items.length);
  const completed = new Array<boolean>(items.length).fill(false);
  let nextIndex = 0;
  let firstError: unknown;

  const worker = async () => {
    while (!controller.signal.aborted) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;

      try {
        results[index] = await runAbortable(
          () => task(items[index], index, controller.signal),
          controller.signal,
        );
        completed[index] = true;
      } catch (error) {
        if (firstError === undefined) firstError = error;
        if (!controller.signal.aborted) controller.abort(error);
        return;
      }
    }
  };

  try {
    const workerCount = Math.min(concurrency, items.length);
    await Promise.allSettled(
      Array.from({ length: workerCount }, () => worker()),
    );

    if (signal.aborted) throw abortReason(signal);
    if (firstError !== undefined) throw firstError;
    if (completed.some((value) => !value)) {
      throw new Error(
        "Translation pipeline stopped before all chunks completed",
      );
    }
    return results;
  } finally {
    signal.removeEventListener("abort", onUpstreamAbort);
  }
}
