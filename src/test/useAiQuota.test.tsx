import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@/lib/invokeAuthenticatedFunction", () => ({
  invokeAuthenticatedFunction: (...args: unknown[]) => invokeMock(...args),
}));

import { fetchAiQuotas, useAiQuota, useAiQuotas } from "@/hooks/useAiQuota";

const user = { id: "00000000-0000-4000-8000-000000000001" } as never;
const nextUser = { id: "00000000-0000-4000-8000-000000000002" } as never;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function quotaResponse(used: number, limit = 5) {
  return {
    data: { allowed: used < limit, reason: null, used, limit },
    error: null,
  };
}

describe("useAiQuota request behavior", () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: React.ReactNode }) => React.JSX.Element;

  beforeEach(() => {
    invokeMock.mockReset();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  });

  it("deduplicates the same quota request across simultaneous widgets", async () => {
    invokeMock.mockResolvedValue({
      data: { allowed: true, reason: null, used: 1, limit: 5 },
      error: null,
    });

    const first = renderHook(
      () => useAiQuota("property-pois", user),
      { wrapper },
    );
    const second = renderHook(
      () => useAiQuota("property-pois", user),
      { wrapper },
    );

    await waitFor(() => expect(first.result.current.quotaChecked).toBe(true));
    await waitFor(() => expect(second.result.current.quotaChecked).toBe(true));
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("ai-quota-status", {
      body: { bucket: "property-pois" },
      timeout: 4_000,
    });
  });

  it("starts a fresh request when refresh is forced during an in-flight load", async () => {
    const initial = deferred<ReturnType<typeof quotaResponse>>();
    invokeMock
      .mockReturnValueOnce(initial.promise)
      .mockResolvedValueOnce(quotaResponse(2));

    const { result } = renderHook(
      () => useAiQuota("force-refresh", user),
      { wrapper },
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));

    let refreshPromise!: ReturnType<typeof result.current.refreshQuota>;
    act(() => {
      refreshPromise = result.current.refreshQuota();
    });
    initial.resolve(quotaResponse(1));
    await act(async () => {
      await refreshPromise;
    });

    expect(invokeMock).toHaveBeenCalledTimes(2);
  });

  it("coalesces simultaneous forced refresh callers", async () => {
    const initial = deferred<ReturnType<typeof quotaResponse>>();
    const refresh = deferred<ReturnType<typeof quotaResponse>>();
    invokeMock
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(refresh.promise);

    const { result } = renderHook(
      () => useAiQuota("forced-refresh-coalesce", user),
      { wrapper },
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));

    let first!: ReturnType<typeof result.current.refreshQuota>;
    let second!: ReturnType<typeof result.current.refreshQuota>;
    act(() => {
      first = result.current.refreshQuota();
      second = result.current.refreshQuota();
    });

    expect(invokeMock).toHaveBeenCalledTimes(2);
    refresh.resolve(quotaResponse(3));
    await act(async () => {
      await Promise.all([first, second]);
    });

    initial.resolve(quotaResponse(1));
    await act(async () => {
      await initial.promise;
    });
    expect(result.current.quota?.used).toBe(3);
  });

  it("keeps a newer forced-refresh result when the older load resolves last", async () => {
    const initial = deferred<ReturnType<typeof quotaResponse>>();
    const refresh = deferred<ReturnType<typeof quotaResponse>>();
    invokeMock
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(refresh.promise);

    const { result } = renderHook(
      () => useAiQuota("ordered-refresh", user),
      { wrapper },
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));

    let refreshPromise!: ReturnType<typeof result.current.refreshQuota>;
    act(() => {
      refreshPromise = result.current.refreshQuota();
    });
    refresh.resolve(quotaResponse(3));
    await act(async () => {
      await refresh.promise;
    });
    initial.resolve(quotaResponse(1));
    await act(async () => {
      await Promise.all([initial.promise, refreshPromise]);
    });

    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(result.current.quota?.used).toBe(3);
  });

  it("makes a forced refresh the shared request for widgets mounted afterwards", async () => {
    const initial = deferred<ReturnType<typeof quotaResponse>>();
    const refresh = deferred<ReturnType<typeof quotaResponse>>();
    invokeMock
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(refresh.promise);

    const first = renderHook(
      () => useAiQuota("forced-shared-refresh", user),
      { wrapper },
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));

    let refreshPromise!: ReturnType<typeof first.result.current.refreshQuota>;
    act(() => {
      refreshPromise = first.result.current.refreshQuota();
    });
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));

    const second = renderHook(
      () => useAiQuota("forced-shared-refresh", user),
      { wrapper },
    );
    await act(async () => Promise.resolve());
    expect(invokeMock).toHaveBeenCalledTimes(2);

    refresh.resolve(quotaResponse(4));
    await act(async () => {
      await refreshPromise;
    });
    await waitFor(() => expect(second.result.current.quota?.used).toBe(4));

    initial.resolve(quotaResponse(1));
    await act(async () => {
      await initial.promise;
    });

    expect(first.result.current.quota?.used).toBe(4);
    expect(second.result.current.quota?.used).toBe(4);
  });

  it("ignores an older quota response after the user changes", async () => {
    const previousUserLoad = deferred<ReturnType<typeof quotaResponse>>();
    const nextUserLoad = deferred<ReturnType<typeof quotaResponse>>();
    invokeMock
      .mockReturnValueOnce(previousUserLoad.promise)
      .mockReturnValueOnce(nextUserLoad.promise);

    const { result, rerender } = renderHook(
      ({ currentUser }) => useAiQuota("user-change", currentUser),
      { initialProps: { currentUser: user }, wrapper },
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));

    rerender({ currentUser: nextUser });
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
    nextUserLoad.resolve(quotaResponse(4));
    await waitFor(() => expect(result.current.quota?.used).toBe(4));

    previousUserLoad.resolve(quotaResponse(1));
    await act(async () => {
      await previousUserLoad.promise;
    });

    expect(result.current.quota?.used).toBe(4);
  });

  it("keeps quota state cleared when the user is removed during a load", async () => {
    const pending = deferred<ReturnType<typeof quotaResponse>>();
    invokeMock.mockReturnValueOnce(pending.promise);

    const { result, rerender } = renderHook(
      ({ currentUser }) => useAiQuota("user-removed", currentUser),
      { initialProps: { currentUser: user as typeof user | null }, wrapper },
    );
    await waitFor(() => expect(result.current.quotaLoading).toBe(true));

    rerender({ currentUser: null });
    pending.resolve(quotaResponse(1));
    await act(async () => {
      await pending.promise;
    });

    expect(result.current.quota).toBeNull();
    expect(result.current.quotaLoading).toBe(false);
    expect(result.current.quotaChecked).toBe(false);
  });

  it("starts a fresh load after an in-flight hook is unmounted", async () => {
    const abandoned = deferred<ReturnType<typeof quotaResponse>>();
    invokeMock
      .mockReturnValueOnce(abandoned.promise)
      .mockResolvedValueOnce(quotaResponse(2));

    const first = renderHook(
      () => useAiQuota("unmounted-load", user),
      { wrapper },
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    first.unmount();

    abandoned.resolve(quotaResponse(1));
    await act(async () => {
      await abandoned.promise;
    });

    const second = renderHook(
      () => useAiQuota("unmounted-load", user),
      { wrapper },
    );
    await waitFor(() => expect(second.result.current.quota?.used).toBe(2));
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });

  it("keeps newer batch quotas when an older batch load resolves last", async () => {
    const initial = deferred<{
      data: { quotas: Record<string, ReturnType<typeof quotaResponse>["data"]> };
      error: null;
    }>();
    const refresh = deferred<{
      data: { quotas: Record<string, ReturnType<typeof quotaResponse>["data"]> };
      error: null;
    }>();
    invokeMock
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(refresh.promise);

    const { result } = renderHook(
      () => useAiQuotas(["batch-b", "batch-a"], user),
      { wrapper },
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));

    let refreshPromise!: ReturnType<typeof result.current.refreshQuotas>;
    act(() => {
      refreshPromise = result.current.refreshQuotas();
    });
    refresh.resolve({
      data: {
        quotas: {
          "batch-a": quotaResponse(3).data,
          "batch-b": quotaResponse(4).data,
        },
      },
      error: null,
    });
    await act(async () => {
      await refresh.promise;
    });
    initial.resolve({
      data: {
        quotas: {
          "batch-a": quotaResponse(1).data,
          "batch-b": quotaResponse(1).data,
        },
      },
      error: null,
    });
    await act(async () => {
      await Promise.all([initial.promise, refreshPromise]);
    });

    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(result.current.quotas["batch-a"]?.used).toBe(3);
    expect(result.current.quotas["batch-b"]?.used).toBe(4);
  });

  it("does not fan a failed batch into one request per bucket", async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error("unavailable") });

    await expect(
      fetchAiQuotas(["property-valuation", "neighbourhood-report"]),
    ).rejects.toThrow("unavailable");

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("ai-quota-status", {
      body: { buckets: ["property-valuation", "neighbourhood-report"] },
      timeout: 4_000,
    });
  });

  it("coalesces overlapping batch and single requests per user and bucket", async () => {
    const pending = deferred<{
      data: { quotas: Record<string, ReturnType<typeof quotaResponse>["data"]> };
      error: null;
    }>();
    invokeMock.mockReturnValueOnce(pending.promise);

    const batch = renderHook(
      () => useAiQuotas(["property-valuation", "neighbourhood-report"], user),
      { wrapper },
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));

    const single = renderHook(
      () => useAiQuota("property-valuation", user),
      { wrapper },
    );
    await act(async () => Promise.resolve());
    expect(invokeMock).toHaveBeenCalledTimes(1);

    pending.resolve({
      data: {
        quotas: {
          "property-valuation": quotaResponse(2).data,
          "neighbourhood-report": quotaResponse(1).data,
        },
      },
      error: null,
    });

    await waitFor(() => expect(batch.result.current.quotaChecked).toBe(true));
    await waitFor(() => expect(single.result.current.quotaChecked).toBe(true));
    expect(single.result.current.quota?.used).toBe(2);
  });
});
