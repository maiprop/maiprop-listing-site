import { useQuery } from "@tanstack/react-query";
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { fetchPublicApi } from "@/lib/publicApi";
import { getAuctionRound } from "@/lib/auctionUtils";

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
  listing_id?: string;
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

type PublicAuctionsEnvelope = {
  data: AuctionListingRow[];
  revision?: string;
  page?: number;
  pageSize?: number;
  total?: number;
  totalRaw?: number;
  totalPages?: number;
  facets?: Partial<PublicAuctionsResponse["facets"]>;
  stats?: Partial<PublicAuctionsResponse["stats"]>;
};

type PublicAuctionsPayload = PublicAuctionsEnvelope | AuctionListingRow[];

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

const positiveInteger = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
};

const finiteNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function normalizePublicAuctionsResponse(
  payload: PublicAuctionsPayload | null | undefined,
  options: {
    fetchLimit: number;
    page?: number;
    pageSize?: number;
    nowMs?: number;
  },
): PublicAuctionsResponse {
  const envelope: PublicAuctionsEnvelope | null = Array.isArray(payload)
    ? { data: payload }
    : payload ?? null;
  if (!envelope || !Array.isArray(envelope.data)) {
    throw new Error("Public auctions API returned an invalid payload");
  }

  const nowMs = options.nowMs ?? Date.now();
  const page = positiveInteger(envelope.page, positiveInteger(options.page, 1));
  const pageSize = positiveInteger(
    envelope.pageSize,
    positiveInteger(options.pageSize, options.fetchLimit),
  );
  const data = envelope.data
    .slice(0, Math.min(options.fetchLimit, pageSize))
    .map((row) => normalizeAuctionPromotionState(row, nowMs));
  const total = Math.max(0, finiteNumber(envelope.total, envelope.data.length));
  const totalRaw = Math.max(total, finiteNumber(envelope.totalRaw, total));
  const totalPages = positiveInteger(
    envelope.totalPages,
    Math.max(1, Math.ceil(total / pageSize)),
  );

  const derivedCities = [...new Set(data.map((row) => row.city).filter(Boolean))].sort();
  const derivedRounds = [...new Set(
    data
      .map((row) => getAuctionRound(row.tags))
      .filter((round): round is number => round != null),
  )].sort((a, b) => a - b);
  const bidValues = data
    .map((row) => Number(row.auction_starting_bid ?? row.price ?? 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  const startOfTodayUtc = Date.parse(`${new Date(nowMs).toISOString().slice(0, 10)}T00:00:00.000Z`);
  const endOfWeekUtc = startOfTodayUtc + 7 * 24 * 60 * 60 * 1000;
  const derivedThisWeek = data.filter((row) => {
    if (!row.auction_date) return false;
    const auctionDate = Date.parse(row.auction_date);
    return Number.isFinite(auctionDate) && auctionDate >= startOfTodayUtc && auctionDate < endOfWeekUtc;
  }).length;

  return {
    data,
    revision: typeof envelope.revision === "string" ? envelope.revision : "legacy",
    page,
    pageSize,
    total,
    totalRaw,
    totalPages,
    facets: {
      cities: Array.isArray(envelope.facets?.cities)
        ? envelope.facets.cities.filter(Boolean)
        : derivedCities,
      rounds: Array.isArray(envelope.facets?.rounds)
        ? envelope.facets.rounds.filter((round) => Number.isFinite(round))
        : derivedRounds,
    },
    stats: {
      thisWeek: finiteNumber(envelope.stats?.thisWeek, derivedThisWeek),
      avgBid: finiteNumber(
        envelope.stats?.avgBid,
        bidValues.length > 0
          ? Math.round(bidValues.reduce((sum, value) => sum + value, 0) / bidValues.length)
          : 0,
      ),
      mappableCount: finiteNumber(
        envelope.stats?.mappableCount,
        data.filter((row) => row.latitude != null && row.longitude != null).length,
      ),
    },
  };
}

const fetchAuctionByIdFromPublicApi = async (
  id: string,
  today: string,
  signal?: AbortSignal,
): Promise<AuctionListingRow | null> => {
  const query = UUID_RE.test(id)
    ? `ids=${encodeURIComponent(id)}`
    : `osTag=${encodeURIComponent(id)}`;
  const response = await fetchPublicApi<PublicAuctionsPayload>(
    `/api/public/auctions?limit=60&page=1&pageSize=1&${query}`,
    { throwOnError: true, signal },
  );
  const row = normalizePublicAuctionsResponse(response, {
    fetchLimit: PUBLIC_AUCTION_FETCH_LIMIT,
    page: 1,
    pageSize: 1,
  }).data[0] ?? null;
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
): Promise<PublicAuctionsPayload> {
  const sessionResult = await supabase.auth.getSession();
  if (sessionResult.error) throw sessionResult.error;
  const accessToken = sessionResult.data.session?.access_token;
  if (!accessToken) {
    throw new Error("Authentication is required for the expanded auction catalogue");
  }

  const response = await fetchPublicApi<PublicAuctionsPayload>(
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
      const payload = fetchLimit > PUBLIC_AUCTION_FETCH_LIMIT
        ? await authenticatedAuctionRequest(requestPath, signal)
        : await fetchPublicApi<PublicAuctionsPayload>(requestPath, {
          throwOnError: true,
          signal,
        });
      return normalizePublicAuctionsResponse(payload, {
        fetchLimit,
        page: options.page,
        pageSize: options.pageSize,
      });
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
