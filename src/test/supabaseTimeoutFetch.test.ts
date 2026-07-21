import { describe, expect, it, vi } from "vitest";
import { createTimeoutFetch } from "@/integrations/supabase/timeoutFetch";

function abortingFetch(): typeof fetch {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
    })) as unknown as typeof fetch;
}

describe("Supabase timeout fetch", () => {
  it("preserves a caller abort instead of reporting a timeout", async () => {
    const caller = new AbortController();
    const fetchImpl = abortingFetch();
    const wrapped = createTimeoutFetch({
      fetchImpl,
      defaultTimeoutMs: 1_000,
      functionTimeoutMs: 1_000,
    });

    const request = wrapped("https://example.test/rest/v1/listings", {
      signal: caller.signal,
    });
    caller.abort(new DOMException("query cancelled", "AbortError"));

    await expect(request).rejects.toMatchObject({
      name: "AbortError",
      message: "query cancelled",
    });
  });

  it("still reports an internal deadline as a timeout", async () => {
    vi.useFakeTimers();
    const wrapped = createTimeoutFetch({
      fetchImpl: abortingFetch(),
      defaultTimeoutMs: 25,
      functionTimeoutMs: 50,
    });

    const request = expect(wrapped("https://example.test/rest/v1/listings"))
      .rejects.toThrow("Supabase request timed out after 0s");
    await vi.advanceTimersByTimeAsync(25);

    await request;
    vi.useRealTimers();
  });

  it("uses the longer deadline for Edge Function invocations", async () => {
    vi.useFakeTimers();
    const wrapped = createTimeoutFetch({
      fetchImpl: abortingFetch(),
      defaultTimeoutMs: 25,
      functionTimeoutMs: 50,
    });

    const request = expect(wrapped("https://example.test/functions/v1/report"))
      .rejects.toThrow("Supabase request timed out after 0s");
    await vi.advanceTimersByTimeAsync(25);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(25);

    await request;
    vi.useRealTimers();
  });
});
