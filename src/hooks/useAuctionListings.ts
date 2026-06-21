import { useQuery } from "@tanstack/react-query";
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { fetchPublicApi } from "@/lib/publicApi";
import { logger } from "@/lib/logger";
import { fetchAuctionsFallback } from "@/lib/publicListingFallbacks";

const QUERY_TIMEOUT_MS = 15_000;
const PORTAL_AUCTION_FETCH_LIMIT = 600;
const AUCTION_RANDOMIZATION_SALT = "maiprop-auctions-v1";
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
  | "priority_placement"
> & {
  listing_images?: { url: string; sort_order: number }[];
};

type PublicAuctionsResponse = {
  data?: AuctionListingRow[];
};

type PublicAuctionDetailResponse = {
  data?: AuctionListingRow | null;
};

const getTodayDate = (): string => {
  return new Date().toISOString().split("T")[0];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const normalizeAuctionFetchLimit = (maxRows?: number): number => {
  if (!Number.isFinite(maxRows)) return PORTAL_AUCTION_FETCH_LIMIT;
  return Math.max(1, Math.min(PORTAL_AUCTION_FETCH_LIMIT, Math.floor(Number(maxRows))));
};

const hashString = (value: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const getAuctionRotationSeed = (date = new Date()): string => {
  return `${AUCTION_RANDOMIZATION_SALT}:${date.toISOString().slice(0, 10)}`;
};

const getAuctionShuffleScore = (row: AuctionListingRow, seed: string): number => {
  return hashString(`${seed}:${row.id}:${row.auction_date ?? ""}:${row.city ?? ""}`);
};

export const randomizeAuctionPresentation = (
  rows: AuctionListingRow[],
  seed = getAuctionRotationSeed(),
): AuctionListingRow[] => {
  return [...rows].sort((a, b) => {
    const priorityDelta = (b.priority_placement ?? 0) - (a.priority_placement ?? 0);
    if (priorityDelta !== 0) return priorityDelta;
    const featuredDelta = Number(b.is_featured) - Number(a.is_featured);
    if (featuredDelta !== 0) return featuredDelta;
    return getAuctionShuffleScore(a, seed) - getAuctionShuffleScore(b, seed);
  });
};

const fetchAuctionByIdFromPublicApi = async (
  id: string,
  today: string,
): Promise<AuctionListingRow | null> => {
  const query = UUID_RE.test(id)
    ? `id=${encodeURIComponent(id)}`
    : `osTag=${encodeURIComponent(id)}`;
  const response = await fetchPublicApi<PublicAuctionDetailResponse>(
    `/api/public/listing?${query}`,
    { throwOnError: true },
  );
  const row = response?.data ?? null;
  if (!row || row.listing_type !== "auction") return null;
  if (row.auction_date && row.auction_date < today) return null;
  return row;
};

const fetchAuctionByIdFromSupabase = async (
  id: string,
  today: string,
): Promise<AuctionListingRow | null> => {
  const auctionId = id.trim();
  let query = supabase
    .from("listings")
    .select(`
      id,title,city,address,price,auction_starting_bid,auction_date,auction_court,
      property_type,listing_type,cover_image_url,sqm,bedrooms,bathrooms,floor,total_floors,
      latitude,longitude,tags,year_built,construction_status,website_url,region,
      is_featured,priority_placement,listing_images(url,sort_order)
    `)
    .eq("status", "active")
    .eq("is_off_market", false)
    .eq("listing_type", "auction")
    .or(`auction_date.gte.${today},auction_date.is.null`)
    .order("sort_order", { referencedTable: "listing_images", ascending: true })
    .limit(3, { referencedTable: "listing_images" });

  query = UUID_RE.test(auctionId)
    ? query.eq("id", auctionId)
    : query.contains("tags", [`os_auction:${auctionId}`]);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return (data ?? null) as AuctionListingRow | null;
};

export const fetchAuctionListingById = async (id: string): Promise<AuctionListingRow | null> => {
  const auctionId = id.trim();
  if (!auctionId) return null;

  const today = getTodayDate();
  try {
    return await fetchAuctionByIdFromPublicApi(auctionId, today);
  } catch (error) {
    logger.warn("Public auction detail API failed; falling back to constrained Supabase read:", error);
    return fetchAuctionByIdFromSupabase(auctionId, today);
  }
};

const fetchPublicAuctionListings = async (maxRows: number): Promise<AuctionListingRow[]> => {
  const response = await fetchPublicApi<PublicAuctionsResponse | AuctionListingRow[]>(
    `/api/public/auctions?limit=${maxRows}`,
    { throwOnError: true },
  );
  if (!response) throw new Error("Public auctions API returned no data");
  const rows = Array.isArray(response) ? response : response.data;
  return Array.isArray(rows) ? rows.slice(0, maxRows) : [];
};

const fetchAuctionListings = async (maxRows: number): Promise<AuctionListingRow[]> => {
  try {
    return await fetchPublicAuctionListings(maxRows);
  } catch (error) {
    logger.warn("Public auctions API failed; falling back to constrained Supabase read:", error);
    return randomizeAuctionPresentation(await fetchAuctionsFallback<AuctionListingRow>(maxRows));
  }
};

const getTimeoutRejection = (
  setTimer: (timer: ReturnType<typeof setTimeout>) => void,
): Promise<never> => {
  return new Promise((_, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Request timeout"));
    }, QUERY_TIMEOUT_MS);
    setTimer(timer);
  });
};

const withAuctionTimeout = async (
  request: Promise<AuctionListingRow[]>,
): Promise<AuctionListingRow[]> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      getTimeoutRejection((timer) => {
        timeout = timer;
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

const getAuctionQuery = (maxRows: number): Promise<AuctionListingRow[]> => {
  return withAuctionTimeout(fetchAuctionListings(maxRows));
};

export type UseAuctionListingsOptions = {
  enabled?: boolean;
};

export const useAuctionListings = (maxRows?: number, options: UseAuctionListingsOptions = {}) => {
  const fetchLimit = normalizeAuctionFetchLimit(maxRows);
  return useQuery({
    queryKey: ["auction-listings", fetchLimit],
    queryFn: () => getAuctionQuery(fetchLimit),
    enabled: options.enabled ?? true,
    staleTime: AUCTION_QUERY_STALE_TIME,
    gcTime: AUCTION_QUERY_GC_TIME,
  });
};
