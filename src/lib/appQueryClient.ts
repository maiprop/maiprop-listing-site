import { QueryClient } from "@tanstack/react-query";
import { isPublicApiTimeoutError } from "@/lib/publicApi";

import {
  DEFAULT_QUERY_GC_TIME,
  USER_SCOPED_QUERY_STALE_TIME,
} from "@/lib/queryCachePolicy";
import { mutationCache, queryCache } from "@/lib/queryObserver";

/**
 * Shared query retry policy. A public-API timeout already leaves the last
 * placeholderData/snapshot on screen (homepage + grid fall back instantly),
 * so retrying would only delay the settled error state by another full
 * timeout window while doubling catalogue load. Hard errors keep one retry.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isPublicApiTimeoutError(error)) return false;
  return failureCount < 1;
}

export const appQueryClient = new QueryClient({
  queryCache,
  mutationCache,
  defaultOptions: {
    queries: {
      retry: shouldRetryQuery,
      refetchOnWindowFocus: false,
      staleTime: USER_SCOPED_QUERY_STALE_TIME,
      gcTime: DEFAULT_QUERY_GC_TIME,
    },
  },
});
