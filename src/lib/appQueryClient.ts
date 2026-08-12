import { QueryClient } from "@tanstack/react-query";

import {
  DEFAULT_QUERY_GC_TIME,
  USER_SCOPED_QUERY_STALE_TIME,
} from "@/lib/queryCachePolicy";
import { mutationCache, queryCache } from "@/lib/queryObserver";

export const appQueryClient = new QueryClient({
  queryCache,
  mutationCache,
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: USER_SCOPED_QUERY_STALE_TIME,
      gcTime: DEFAULT_QUERY_GC_TIME,
    },
  },
});
