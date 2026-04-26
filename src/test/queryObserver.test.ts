/**
 * Tests for the React Query observability cache wrappers in @/lib/queryObserver.
 *
 * The module reads `window.__sentryClient` lazily inside each callback, so we
 * can drive both the "Sentry installed" and "Sentry absent" paths from the
 * same test file simply by toggling the global between cases.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

describe("queryObserver.queryCache.onSuccess (slow query reporting)", () => {
  // We seed both spies on entry so TS can infer the precise MockInstance
  // signature from the assignment expression. Annotating with a hand-rolled
  // `ReturnType<typeof vi.spyOn<...>>` clashes with vitest 3.x's stricter
  // method-only constraint on the second generic.
  let getEntriesByTypeSpy = vi.spyOn(performance, "getEntriesByType");
  let consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

  beforeEach(() => {
    clearSentryStub();
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    getEntriesByTypeSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    clearSentryStub();
  });

  it("does not call Sentry for fast queries", () => {
    const stub = installSentryStub();
    getEntriesByTypeSpy = vi
      .spyOn(performance, "getEntriesByType")
      .mockReturnValue([] as never);
    const query = {
      queryKey: ["fast"],
      state: { status: "success", dataUpdatedAt: 0, fetchFailureCount: 0 },
    };
    queryCache.config.onSuccess?.(undefined, query as never);
    expect(stub.captureMessage).not.toHaveBeenCalled();
  });

  it("calls Sentry.captureMessage when a perf measure exceeds the slow-query threshold", () => {
    const stub = installSentryStub();
    const queryKeyStr = '["slow"]';
    getEntriesByTypeSpy = vi
      .spyOn(performance, "getEntriesByType")
      .mockReturnValue([
        // jsdom returns generic objects for measure entries; cast through unknown.
        { name: `rq:${queryKeyStr}`, duration: 1500 } as unknown as PerformanceEntry,
      ] as never);
    const query = {
      queryKey: ["slow"],
      state: { status: "success", dataUpdatedAt: 0, fetchFailureCount: 0 },
    };
    queryCache.config.onSuccess?.(undefined, query as never);
    expect(stub.captureMessage).toHaveBeenCalledTimes(1);
    expect(stub.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("Slow query (1500ms)"),
      expect.objectContaining({
        level: "warning",
        tags: { source: "react-query-slow" },
      }),
    );
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
