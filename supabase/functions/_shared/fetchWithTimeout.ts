/**
 * Wraps `fetch()` with an `AbortController`-based timeout.
 * Default 30 s — long enough for slow upstream APIs, short enough to
 * prevent Deno isolate timeouts (60 s hard cap).
 */
export const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

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
