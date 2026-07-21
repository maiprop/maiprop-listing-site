type TimeoutFetchOptions = {
  fetchImpl?: typeof fetch;
  defaultTimeoutMs: number;
  functionTimeoutMs: number;
};

function requestSignal(input: RequestInfo | URL, init?: RequestInit): AbortSignal | null {
  if (init?.signal) return init.signal;
  return typeof Request !== "undefined" && input instanceof Request ? input.signal : null;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

export function createTimeoutFetch({
  fetchImpl = fetch,
  defaultTimeoutMs,
  functionTimeoutMs,
}: TimeoutFetchOptions): typeof fetch {
  return async (input, init) => {
    const callerSignal = requestSignal(input, init);
    const controller = new AbortController();
    const timeoutMs = requestUrl(input).includes("/functions/v1/")
      ? functionTimeoutMs
      : defaultTimeoutMs;
    let deadlineExceeded = false;

    const forwardCallerAbort = () => {
      controller.abort(callerSignal?.reason ?? new DOMException("Request aborted", "AbortError"));
    };
    if (callerSignal?.aborted) {
      forwardCallerAbort();
    } else {
      callerSignal?.addEventListener("abort", forwardCallerAbort, { once: true });
    }

    const timer = setTimeout(() => {
      deadlineExceeded = true;
      controller.abort(
        new DOMException(`Request timed out after ${Math.round(timeoutMs / 1000)}s`, "AbortError"),
      );
    }, timeoutMs);

    try {
      return await fetchImpl(input, { ...init, signal: controller.signal });
    } catch (error: unknown) {
      if (deadlineExceeded && isAbortError(error)) {
        throw new Error(`Supabase request timed out after ${Math.round(timeoutMs / 1000)}s`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", forwardCallerAbort);
    }
  };
}
