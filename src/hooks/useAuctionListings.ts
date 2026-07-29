import { useQuery } from "@tanstack/react-query";
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { fetchPublicApi } from "@/lib/publicApi";

const QUERY_TIMEOUT_MS = 15_000;
const PORTAL_AUCTION_FETCH_LIMIT = 600;
const PUBLIC_AUCTION_FETCH_LIMIT = 60;
const AUCTION_QUERY_STALE_TIME = 5 * 60_000;
const AUCTION_QUERY_GC_TIME = 30 * 60_000;

/**
 * Shape returned by the public auction endpoint and exact detail lookups.
 * Columns are a Pick<> against the
 * generated Row type so each field keeps its original nullability (title is
 * string, latitude is number|null, etc) — a Partial<> would over-widen
 * everything to `| undefined` and break consumers like `MapListing`.
 */
export type AuctionListingRow = Pick<
  Database["public"]["Tables"]["listings"]["Row"],
  | "id"
  | "title"
  | "city"
  | "address"
  | "price"
  | "auction_starting_bid"
  | "auction_date"
  | "auction_court"
  | "property_type"
  | "listing_type"
  | "cover_image_url"
  | "sqm"
  | "bedrooms"
  | "bathrooms"
  | "floor"
  | "total_floors"
  | "latitude"
  | "longitude"
  | "tags"
  | "year_built"
  | "construction_status"
  | "website_url"
  | "region"
  | "is_featured"
  | "featured_until"
  | "priority_placement"
  | "priority_until"
> & {
  listing_images?: { url: string; sort_order: number }[];
};

type PublicAuctionsResponse = {
  data: AuctionListingRow[];
  revision: string;
  page: number;
  pageSize: number;
  total: number;
  totalRaw: number;
  totalPages: number;
  facets: {
    cities: string[];
    rounds: number[];
  };
  stats: {
    thisWeek: number;
    avgBid: number;
    mappableCount: number;
  };
};

const getTodayDate = (): string => {
  return new Date().toISOString().split("T")[0];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const normalizeAuctionFetchLimit = (maxRows?: number): number => {
  if (!Number.isFinite(maxRows)) return PUBLIC_AUCTION_FETCH_LIMIT;
  return Math.max(1, Math.min(PORTAL_AUCTION_FETCH_LIMIT, Math.floor(Number(maxRows))));
};

const hasFuturePromotionExpiry = (value: string | null, nowMs: number): boolean => {
  if (!value) return false;
  const expiresAt = Date.parse(value);
  return Number.isFinite(expiresAt) && expiresAt > nowMs;
};

const normalizeAuctionPromotionState = (
  row: AuctionListingRow,
  nowMs: number,
): AuctionListingRow => ({
  ...row,
  is_featured: Boolean(row.is_featured) && hasFuturePromotionExpiry(row.featured_until, nowMs),
  priority_placement:
    Number(row.priority_placement ?? 0) > 0 && hasFuturePromotionExpiry(row.priority_until, nowMs)
      ? 1
      : 0,
});

const fetchAuctionByIdFromPublicApi = async (
  id: string,
  today: string,
  signal?: AbortSignal,
): Promise<AuctionListingRow | null> => {
  const query = UUID_RE.test(id)
    ? `ids=${encodeURIComponent(id)}`
    : `osTag=${encodeURIComponent(id)}`;
  const response = await fetchPublicApi<PublicAuctionsResponse>(
    `/api/public/auctions?limit=60&page=1&pageSize=1&${query}`,
    { throwOnError: true, signal },
  );
  const row = response?.data?.[0] ?? null;
  if (!row || row.listing_type !== "auction") return null;
  if (row.auction_date && row.auction_date < today) return null;
  return normalizeAuctionPromotionState(row, Date.now());
};

export const fetchAuctionListingById = async (id: string, signal?: AbortSignal): Promise<AuctionListingRow | null> => {
  const auctionId = id.trim();
  if (!auctionId) return null;

  const today = getTodayDate();
  return fetchAuctionByIdFromPublicApi(auctionId, today, signal);
};

export type AuctionListingFilters = {
  city?: string;
  propertyType?: string;
  bidRange?: string;
  yearRange?: string;
  sqmRange?: string;
  ownership?: string;
  round?: string;
  yield?: string;
  ids?: string[];
};

export type AuctionListingsPage = PublicAuctionsResponse;

export type UseAuctionListingsOptions = {
  enabled?: boolean;
  page?: number;
  pageSize?: number;
  revision?: string;
  filters?: AuctionListingFilters;
};

function appendTextParam(params: URLSearchParams, name: string, value: string | undefined): void {
  const normalized = value?.trim();
  if (normalized) params.set(name, normalized);
}

function buildAuctionListingsPath(
  maxRows: number,
  options: UseAuctionListingsOptions,
): string {
  const params = new URLSearchParams([["limit", String(maxRows)]]);
  if (options.page != null) params.set("page", String(Math.max(1, Math.trunc(options.page))));
  if (options.pageSize != null) {
    params.set("pageSize", String(Math.max(1, Math.trunc(options.pageSize))));
  }
  appendTextParam(params, "revision", options.revision);
  appendTextParam(params, "city", options.filters?.city);
  appendTextParam(params, "propertyType", options.filters?.propertyType);
  appendTextParam(params, "bidRange", options.filters?.bidRange);
  appendTextParam(params, "yearRange", options.filters?.yearRange);
  appendTextParam(params, "sqmRange", options.filters?.sqmRange);
  appendTextParam(params, "ownership", options.filters?.ownership);
  appendTextParam(params, "round", options.filters?.round);
  appendTextParam(params, "yield", options.filters?.yield);
  const ids = [...new Set(options.filters?.ids ?? [])]
    .map((id) => id.trim())
    .filter(Boolean)
    .sort();
  if (ids.length > 0) params.set("ids", ids.join(","));
  return `/api/public/auctions?${params.toString()}`;
}

async function authenticatedAuctionRequest(
  path: string,
  signal?: AbortSignal,
): Promise<PublicAuctionsResponse> {
  const sessionResult = await supabase.auth.getSession();
  if (sessionResult.error) throw sessionResult.error;
  const accessToken = sessionResult.data.session?.access_token;
  if (!accessToken) {
    throw new Error("Authentication is required for the expanded auction catalogue");
  }

  const response = await fetchPublicApi<PublicAuctionsResponse>(
    path,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal,
      throwOnError: true,
      timeoutMs: QUERY_TIMEOUT_MS,
    },
  );
  if (!response) {
    throw new Error("Authenticated auction catalogue returned no data");
  }
  return response;
}

export const useAuctionListings = (maxRows?: number, options: UseAuctionListingsOptions = {}) => {
  const fetchLimit = normalizeAuctionFetchLimit(maxRows);
  const requestPath = buildAuctionListingsPath(fetchLimit, options);
  const query = useQuery({
    queryKey: ["auction-listings", requestPath],
    queryFn: async ({ signal }): Promise<PublicAuctionsResponse> => {
      const response = fetchLimit > PUBLIC_AUCTION_FETCH_LIMIT
        ? await authenticatedAuctionRequest(requestPath, signal)
        : await fetchPublicApi<PublicAuctionsResponse>(requestPath, {
          throwOnError: true,
          signal,
        });
      if (!response || !Array.isArray(response.data)) {
        throw new Error("Public auctions API returned an invalid payload");
      }
      const nowMs = Date.now();
      const responseLimit = options.pageSize == null
        ? fetchLimit
        : Math.max(1, Math.min(fetchLimit, Math.trunc(options.pageSize)));
      return {
        ...response,
        data: response.data
          .slice(0, responseLimit)
          .map((row) => normalizeAuctionPromotionState(row, nowMs)),
      };
    },
    enabled: options.enabled ?? true,
    staleTime: AUCTION_QUERY_STALE_TIME,
    gcTime: AUCTION_QUERY_GC_TIME,
  });
  return {
    ...query,
    data: query.data?.data,
    auctionPage: query.data,
  };
};
