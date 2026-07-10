import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPublicApi, PublicApiError, shouldLogPublicApiFallback } from "@/lib/publicApi";

describe("public API fallback logging", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not warn for dev-only transient fetch aborts", () => {
    expect(shouldLogPublicApiFallback(new TypeError("Failed to fetch"))).toBe(false);
    expect(shouldLogPublicApiFallback(new DOMException("Aborted", "AbortError"))).toBe(false);
  });

  it("still warns for structured public API contract failures", () => {
    expect(
      shouldLogPublicApiFallback(
        new PublicApiError("/api/public/listings", "Public API returned a non-JSON response", 200),
      ),
    ).toBe(true);
  });

  it("propagates caller cancellation into the underlying fetch", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);

    const request = fetchPublicApi("/api/public/listings", {
      throwOnError: true,
      signal: controller.signal,
      timeoutMs: 10_000,
    });
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("/api/public/listings", window.location.origin).toString(),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
