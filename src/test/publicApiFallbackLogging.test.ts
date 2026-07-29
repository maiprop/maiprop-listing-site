import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPublicApi } from "@/lib/publicApi";

describe("public API request cancellation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
      "/api/public/listings",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
