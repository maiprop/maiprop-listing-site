/**
 * Tests for the React Query observability cache wrappers in @/lib/queryObserver.
 *
 * The module reads `window.__sentryClient` lazily inside each callback, so we
 * can drive both the "Sentry installed" and "Sentry absent" paths from the
 * same test file simply by toggling the global between cases.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { QueryClient, onlineManager } from "@tanstack/react-query";
import { queryCache, mutationCache } from "@/lib/queryObserver";

interface SentryStub {
  captureException: ReturnType<typeof vi.fn>;
  captureMessage: ReturnType<typeof vi.fn>;
  addBreadcrumb: ReturnType<typeof vi.fn>;
}

function installSentryStub(): SentryStub {
  const stub: SentryStub = {
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    addBreadcrumb: vi.fn(),
  };
  (window as unknown as { __sentryClient?: SentryStub }).__sentryClient = stub;
  return stub;
}

function clearSentryStub() {
  delete (window as unknown as { __sentryClient?: SentryStub }).__sentryClient;
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("queryObserver.queryCache.onError", () => {
  // Type inferred from the assignment in beforeEach — vitest's spyOn generics
  // change between versions and a hand-rolled annotation here brittle.
  let consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    clearSentryStub();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    clearSentryStub();
  });

  it("forwards the error to Sentry with the serialised query key when Sentry is installed", () => {
    const stub = installSentryStub();
    const err = new Error("boom");
    const query = {
      queryKey: ["listings", "athens"],
      state: { status: "error", dataUpdatedAt: 0, fetchFailureCount: 1 },
    };
    queryCache.config.onError?.(err, query as never);
    expect(stub.captureException).toHaveBeenCalledTimes(1);
    expect(stub.captureException).toHaveBeenCalledWith(
      err,
      expect.objectContaining({
        tags: { source: "react-query" },
        extra: expect.objectContaining({ queryKey: '["listings","athens"]' }),
      }),
    );
  });

  it("is a no-op (does not throw) when Sentry is absent", () => {
    const err = new Error("nope");
    const query = {
      queryKey: ["x"],
      state: { status: "error", dataUpdatedAt: 0, fetchFailureCount: 0 },
    };
    expect(() => queryCache.config.onError?.(err, query as never)).not.toThrow();
  });

  it("falls back to String(key) when JSON.stringify throws (e.g. circular)", () => {
    const stub = installSentryStub();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const query = {
      queryKey: [circular],
      state: { status: "error", dataUpdatedAt: 0, fetchFailureCount: 0 },
    };
    queryCache.config.onError?.(new Error("circ"), query as never);
    expect(stub.captureException).toHaveBeenCalledTimes(1);
    // String() of an array containing one object yields "[object Object]"
    const call = stub.captureException.mock.calls[0]!;
    const ctx = call[1] as { extra: { queryKey: string } };
    expect(typeof ctx.extra.queryKey).toBe("string");
  });
});

describe("queryObserver query fetch lifecycle timing", () => {
  let client: QueryClient;
  let now = 0;
  let performanceNowSpy = vi.spyOn(performance, "now").mockReturnValue(0);
  let consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  let consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    queryCache.clear();
    clearSentryStub();
    now = 0;
    performanceNowSpy = vi.spyOn(performance, "now").mockImplementation(() => now);
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    client = new QueryClient({
      queryCache,
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
      },
    });
  });

  afterEach(() => {
    onlineManager.setOnline(true);
    client.unmount();
    client.clear();
    performanceNowSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    clearSentryStub();
  });

  it("reports the measured duration of one completed slow fetch without serialising its query key", async () => {
    const stub = installSentryStub();
    const result = await client.fetchQuery({
      queryKey: ["listing-search", "private-filter-value"],
      queryFn: async () => {
        now = 1_500;
        return "complete";
      },
    });

    expect(result).toBe("complete");
    expect(stub.captureMessage).toHaveBeenCalledTimes(1);
    expect(stub.captureMessage).toHaveBeenCalledWith(
      "Slow React Query fetch (1500ms)",
      {
        level: "warning",
        tags: { source: "react-query-slow", route: "application" },
        extra: { durationMs: 1500, lifecycle: "fetch-to-terminal" },
      },
    );
    expect(JSON.stringify(stub.captureMessage.mock.calls[0])).not.toContain("private-filter-value");
  });

  it("does not report fast fetches or cached reads", async () => {
    const stub = installSentryStub();
    const queryFn = vi.fn(async () => {
      now = 999;
      return "fast";
    });

    await client.fetchQuery({ queryKey: ["fast"], queryFn, staleTime: Infinity });
    now = 5_000;
    await client.fetchQuery({ queryKey: ["fast"], queryFn, staleTime: Infinity });

    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(stub.captureMessage).not.toHaveBeenCalled();
  });

  it("keeps one start time across retries and emits once on success", async () => {
    const stub = installSentryStub();
    let attempts = 0;

    const result = await client.fetchQuery({
      queryKey: ["retry"],
      retry: 1,
      retryDelay: () => {
        now = 900;
        return 0;
      },
      queryFn: async () => {
        attempts += 1;
        if (attempts === 1) {
          now = 600;
          throw new Error("retry me");
        }
        now = 1_500;
        return "recovered";
      },
    });

    expect(result).toBe("recovered");
    expect(attempts).toBe(2);
    expect(stub.captureMessage).toHaveBeenCalledTimes(1);
    expect(stub.captureMessage.mock.calls[0]?.[0]).toBe("Slow React Query fetch (1500ms)");
  });

  it("includes a paused wait in the fetch lifecycle duration", async () => {
    const stub = installSentryStub();
    const queryFn = vi.fn(async () => {
      now = 1_500;
      return "online";
    });
    onlineManager.setOnline(false);
    client.mount();

    const pending = client.fetchQuery({
      queryKey: ["paused"],
      networkMode: "online",
      queryFn,
    });
    await vi.waitFor(() => {
      expect(client.getQueryState(["paused"])?.fetchStatus).toBe("paused");
    });
    expect(queryFn).not.toHaveBeenCalled();

    now = 1_200;
    onlineManager.setOnline(true);
    await expect(pending).resolves.toBe("online");

    expect(stub.captureMessage).toHaveBeenCalledTimes(1);
    expect(stub.captureMessage.mock.calls[0]?.[0]).toBe("Slow React Query fetch (1500ms)");
  });

  it("uses a fresh start time for each refetch", async () => {
    const stub = installSentryStub();
    let invocation = 0;
    const queryFn = async () => {
      invocation += 1;
      now = invocation === 1 ? 1_100 : 3_200;
      return invocation;
    };

    await client.fetchQuery({ queryKey: ["refetch"], queryFn, staleTime: 0 });
    now = 2_000;
    await client.fetchQuery({ queryKey: ["refetch"], queryFn, staleTime: 0 });

    expect(stub.captureMessage.mock.calls.map(([message]) => message)).toEqual([
      "Slow React Query fetch (1100ms)",
      "Slow React Query fetch (1200ms)",
    ]);
  });

  it("reports a slow terminal failure while preserving error reporting", async () => {
    const stub = installSentryStub();
    const terminalError = new Error("terminal failure");
    let attempts = 0;

    await expect(
      client.fetchQuery({
        queryKey: ["terminal-error"],
        retry: 1,
        retryDelay: () => {
          now = Math.max(now, 900);
          return 0;
        },
        queryFn: async () => {
          attempts += 1;
          now = attempts === 1 ? 700 : 1_600;
          throw terminalError;
        },
      }),
    ).rejects.toBe(terminalError);

    expect(stub.captureException).toHaveBeenCalledTimes(1);
    expect(stub.captureMessage).toHaveBeenCalledTimes(1);
    expect(stub.captureMessage.mock.calls[0]?.[0]).toBe("Slow React Query fetch (1600ms)");
  });

  it("clears timing when an in-flight Query is removed and times same-key recreation independently", async () => {
    const stub = installSentryStub();
    const pending = client.fetchQuery({
      queryKey: ["recreated"],
      queryFn: ({ signal }) =>
        new Promise<string>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        }),
    });

    now = 1_200;
    client.removeQueries({ queryKey: ["recreated"] });
    await expect(pending).rejects.toBeDefined();
    expect(stub.captureMessage).not.toHaveBeenCalled();

    now = 2_000;
    await client.fetchQuery({
      queryKey: ["recreated"],
      queryFn: async () => {
        now = 3_500;
        return "new Query instance";
      },
    });

    expect(stub.captureMessage).toHaveBeenCalledTimes(1);
    expect(stub.captureMessage.mock.calls[0]?.[0]).toBe("Slow React Query fetch (1500ms)");
  });

  it("clears timing when default cancellation reverts a retained Query to idle", async () => {
    const stub = installSentryStub();
    client.setQueryData(["retained"], "cached");
    const pending = client.fetchQuery({
      queryKey: ["retained"],
      staleTime: 0,
      queryFn: ({ signal }) =>
        new Promise<string>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        }),
    });
    const settled = pending.catch((error: unknown) => error);

    now = 1_500;
    await client.cancelQueries({ queryKey: ["retained"] });
    await settled;
    expect(client.getQueryState(["retained"])?.fetchStatus).toBe("idle");

    now = 2_000;
    client.setQueryData(["retained"], "manual update after cancellation");

    expect(stub.captureMessage).not.toHaveBeenCalled();
  });

  it("keeps timing an active fetch across a manual cache update", async () => {
    const stub = installSentryStub();
    const fetchResult = deferred<string>();
    const pending = client.fetchQuery({
      queryKey: ["manual-during-fetch"],
      queryFn: () => fetchResult.promise,
    });

    now = 1_200;
    client.setQueryData(["manual-during-fetch"], "optimistic value");
    expect(client.getQueryState(["manual-during-fetch"])?.fetchStatus).toBe("fetching");
    expect(stub.captureMessage).not.toHaveBeenCalled();

    now = 1_500;
    fetchResult.resolve("server value");
    await expect(pending).resolves.toBe("server value");

    expect(stub.captureMessage).toHaveBeenCalledTimes(1);
    expect(stub.captureMessage.mock.calls[0]?.[0]).toBe("Slow React Query fetch (1500ms)");
  });
});

describe("queryObserver.mutationCache.onError", () => {
  // The MutationCache.onError generic signature in @tanstack/react-query v5 is
  // (error, variables, context, mutation) but the type carries internal
  // generics that don't simplify nicely from a unit test. Cast through a
  // local 4-arg shape so the test exercises the real config callback.
  type MutationOnError = (
    err: unknown,
    vars: unknown,
    ctx: unknown,
    mutation: { options: { mutationKey?: readonly unknown[] } },
  ) => void;
  const callOnError: MutationOnError = (err, vars, ctx, mutation) =>
    (mutationCache.config.onError as unknown as MutationOnError | undefined)?.(
      err,
      vars,
      ctx,
      mutation,
    );

  let consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    clearSentryStub();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    clearSentryStub();
  });

  it("forwards the error using the mutationKey when present", () => {
    const stub = installSentryStub();
    const err = new Error("mutation boom");
    callOnError(err, undefined, undefined, { options: { mutationKey: ["createListing"] } });
    expect(stub.captureException).toHaveBeenCalledTimes(1);
    expect(stub.captureException).toHaveBeenCalledWith(
      err,
      expect.objectContaining({
        tags: { source: "react-query-mutation" },
        extra: expect.objectContaining({ mutationKey: '["createListing"]' }),
      }),
    );
  });

  it("uses '(anonymous)' when the mutation has no key", () => {
    const stub = installSentryStub();
    callOnError(new Error("x"), undefined, undefined, { options: {} });
    expect(stub.captureException).toHaveBeenCalledTimes(1);
    expect(stub.captureException.mock.calls[0]![1]).toMatchObject({
      extra: { mutationKey: "(anonymous)" },
    });
  });

  it("is a no-op when Sentry is absent", () => {
    expect(() =>
      callOnError(new Error("y"), undefined, undefined, { options: { mutationKey: ["k"] } }),
    ).not.toThrow();
  });
});
