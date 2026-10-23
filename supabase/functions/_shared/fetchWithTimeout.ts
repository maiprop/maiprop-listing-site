/**
 * Wraps `fetch()` with an `AbortController`-based timeout.
 * Default 30 s — long enough for slow upstream APIs, short enough to
 * prevent Deno isolate timeouts (60 s hard cap).
 */
export const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

/**
 * Sentinel resolved by `withAsyncBudget` when the budget expires first.
 * A unique symbol (not `null`) keeps a legitimate `null` work result
 * unambiguous — several OS helpers resolve `null` for "no data".
 */
export const ASYNC_BUDGET_EXCEEDED: unique symbol = Symbol("async-budget-exceeded");

/**
 * Races arbitrary async work against a wall-clock budget.
 * The loser keeps running in the background and its result is discarded —
 * same generation-discard pattern the frontend uses for stale requests —
 * so callers must only use this when the late result is safe to drop.
 */
export function withAsyncBudget<T>(
  work: Promise<T>,
  budgetMs: number,
): Promise<T | typeof ASYNC_BUDGET_EXCEEDED> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onBudget = new Promise<typeof ASYNC_BUDGET_EXCEEDED>((resolve) => {
    timer = setTimeout(() => resolve(ASYNC_BUDGET_EXCEEDED), budgetMs);
  });
  return Promise.race([work, onBudget]).finally(() => clearTimeout(timer));
}

export function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return fetch(url, { ...init, signal: controller.signal }).finally(() =>
      clearTimeout(timer)
    );
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}
