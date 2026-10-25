import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";

import { appQueryClient, shouldRetryQuery } from "@/lib/appQueryClient";
import { PublicApiError, fetchPublicApi, isPublicApiTimeoutError } from "@/lib/publicApi";
import { useListingsPaginated } from "@/hooks/useListings";

function pendingFetch(_input: unknown, init?: { signal?: AbortSignal }): Promise<Response> {
  return new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener(
      "abort",
      () => reject(new DOMException("Aborted", "AbortError")),
      { once: true },
    );
  });
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error: unknown) {
    return error;
  }
  throw new Error("expected the promise to reject");
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  delete window.__MAIPROP_HOMEPAGE_INITIAL__;
});

describe("public API timeout classification", () => {
  it("classifies a real request deadline as a timeout", async () => {
    vi.stubGlobal("fetch", vi.fn(pendingFetch));

    const error = await captureRejection(
      fetchPublicApi("/api/public/listings", { throwOnError: true, timeoutMs: 20 }),
    );

    expect(error).toBeInstanceOf(PublicApiError);
    expect(isPublicApiTimeoutError(error)).toBe(true);
  });

  it("does not classify a server error as a timeout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers({ "Content-Type": "application/json" }),
      json: vi.fn(),
    } as unknown as Response));

    const error = await captureRejection(
      fetchPublicApi("/api/public/listings", { throwOnError: true, timeoutMs: 1_000 }),
    );

    expect(error).toBeInstanceOf(PublicApiError);
    expect(error).toMatchObject({ status: 500 });
    expect(isPublicApiTimeoutError(error)).toBe(false);
  });

  it("rejects non-timeout failures", () => {
    expect(isPublicApiTimeoutError(new Error("boom"))).toBe(false);
    expect(isPublicApiTimeoutError(new DOMException("Aborted", "AbortError"))).toBe(false);
    expect(isPublicApiTimeoutError(null)).toBe(false);
    expect(isPublicApiTimeoutError(undefined)).toBe(false);
  });
});

describe("query retry policy for public API timeouts", () => {
  it("wires the shared policy into the app query client defaults", () => {
    expect(appQueryClient.getDefaultOptions().queries?.retry).toBe(shouldRetryQuery);
  });

  it("skips retries for timeouts but keeps one retry for hard errors", async () => {
    vi.stubGlobal("fetch", vi.fn(pendingFetch));
    const timeoutError = await captureRejection(
      fetchPublicApi("/api/public/listings", { throwOnError: true, timeoutMs: 20 }),
    );

    expect(shouldRetryQuery(0, timeoutError)).toBe(false);
    expect(shouldRetryQuery(1, timeoutError)).toBe(false);

    const hardError = new Error("Public API returned 503");
    expect(shouldRetryQuery(0, hardError)).toBe(true);
    expect(shouldRetryQuery(1, hardError)).toBe(false);

    const statusError = new PublicApiError(
      "/api/public/listings",
      "Public API request failed with 500",
      500,
    );
    expect(shouldRetryQuery(0, statusError)).toBe(true);
    expect(shouldRetryQuery(1, statusError)).toBe(false);
  });
});

describe("grid placeholder on catalogue timeout", () => {
  it("attempts the timed-out catalogue fetch once and keeps the snapshot placeholder on screen", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(pendingFetch);
    vi.stubGlobal("fetch", fetchMock);
    window.__MAIPROP_HOMEPAGE_INITIAL__ = {
      version: 1,
      generatedAt: new Date().toISOString(),
      saleListings: {
        data: [{ id: "snapshot-sale", owner_id: null, listing_images: [] }],
        hasMore: false,
        page: 1,
        pageSize: 12,
        offset: 0,
      },
    };

    const client = new QueryClient({
      defaultOptions: { queries: { retry: shouldRetryQuery, retryDelay: 0, gcTime: 0, staleTime: 0 } },
    });
    const { result, unmount } = renderHook(() => useListingsPaginated({ listing_type: "sale" }), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    expect(result.current.data?.pages[0]?.data).toEqual([
      expect.objectContaining({ id: "snapshot-sale" }),
    ]);
    expect(result.current.isPlaceholderData).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The 6.5s catalogue deadline elapses: the timeout settles immediately
    // instead of spending a second full timeout window on a retry.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7_000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.isError).toBe(true);
    expect(isPublicApiTimeoutError(result.current.error)).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    unmount();
    client.clear();
  });
});
