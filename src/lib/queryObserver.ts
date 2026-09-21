/**
 * React Query observability — logs slow and failed queries to Sentry.
 *
 * Wired from App.tsx by passing `queryCache` and `mutationCache` options to
 * `new QueryClient({...})`. Zero-cost when Sentry is not initialised (the
 * `__sentryClient` global is undefined).
 *
 * Thresholds:
 *   - A query fetch lifecycle that takes longer than SLOW_QUERY_MS is logged
 *     as a warning-level event (so Sentry's alerting can surface it).
 *   - All query errors produce a Sentry error event with the query key.
 */
import { QueryCache, MutationCache, isCancelledError } from "@tanstack/react-query";

// React Query's callback generics default error to `unknown` — we accept a
// permissive shape and let TS widen via inference.
type AnyQuery = { queryKey: readonly unknown[]; state: { status: string; dataUpdatedAt: number; fetchFailureCount: number } };
type AnyMutation = { options: { mutationKey?: readonly unknown[] } };

const SLOW_QUERY_MS = 1_000;

type SentryLike = {
  captureException: (err: unknown, ctx?: unknown) => void;
  captureMessage: (msg: string, ctx?: unknown) => void;
  addBreadcrumb: (b: unknown) => void;
};

function getSentry(): SentryLike | null {
  const w = window as unknown as { __sentryClient?: SentryLike };
  return w.__sentryClient ?? null;
}

function queryKeyToString(key: readonly unknown[]): string {
  try {
    return JSON.stringify(key);
  } catch {
    return String(key);
  }
}

export const queryCache = new QueryCache({
  onError: (err, query: AnyQuery) => {
    const sentry = getSentry();
    const keyStr = queryKeyToString(query.queryKey);
    // Always log to console in development; Sentry is fire-and-forget.
    if (import.meta.env.DEV) {
      console.error("[react-query error]", keyStr, err);
    }
    sentry?.captureException(err, {
      tags: { source: "react-query" },
      extra: { queryKey: keyStr, state: query.state.status },
    });
  },
});

const fetchStartedAt = new WeakMap<object, number>();

queryCache.subscribe((event) => {
  if (event.type === "removed") {
    fetchStartedAt.delete(event.query);
    return;
  }
  if (event.type !== "updated") return;

  if (event.action.type === "fetch") {
    fetchStartedAt.set(event.query, performance.now());
    return;
  }

  let wasCancelled = false;
  if (event.action.type === "error") {
    wasCancelled = isCancelledError(event.action.error);
  } else if (!(event.action.type === "success" && event.query.state.fetchStatus === "idle")) {
    return;
  }

  const startedAt = fetchStartedAt.get(event.query);
  fetchStartedAt.delete(event.query);
  if (startedAt === undefined || wasCancelled) return;

  const durationMs = performance.now() - startedAt;
  if (durationMs <= SLOW_QUERY_MS) return;

  const message = `Slow React Query fetch (${Math.round(durationMs)}ms)`;
  getSentry()?.captureMessage(message, {
    level: "warning",
    tags: { source: "react-query-slow", route: "application" },
    extra: { durationMs, lifecycle: "fetch-to-terminal" },
  });
  if (import.meta.env.DEV) {
    console.warn("[react-query slow]", message);
  }
});

export const mutationCache = new MutationCache({
  onError: (err, _vars, _ctx, mutation: AnyMutation) => {
    const sentry = getSentry();
    const key = mutation.options.mutationKey
      ? queryKeyToString(mutation.options.mutationKey)
      : "(anonymous)";
    if (import.meta.env.DEV) {
      console.error("[react-query mutation error]", key, err);
    }
    sentry?.captureException(err, {
      tags: { source: "react-query-mutation" },
      extra: { mutationKey: key },
    });
  },
});
