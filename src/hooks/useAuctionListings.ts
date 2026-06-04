import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

const AUCTION_SELECT_CORE = "id, title, city, address, price, auction_starting_bid, auction_date, auction_court, property_type, cover_image_url, sqm, bedrooms, bathrooms, floor, total_floors, latitude, longitude, tags, year_built, construction_status, website_url, region, is_featured, priority_placement";
const QUERY_TIMEOUT_MS = 15_000;
const AUCTION_FETCH_LIMIT = 500;
const PORTAL_AUCTION_FETCH_LIMIT = 600;
const AUCTION_RANDOMIZATION_SALT = "maiprop-auctions-v1";
const AUCTION_QUERY_STALE_TIME = 5 * 60_000;
const AUCTION_QUERY_GC_TIME = 30 * 60_000;
const OS_AUCTION_SOURCE_TAG = "source:maiprop-os";

/**
 * Shape returned by the fetchAll helper. Columns are a Pick<> against the
 * generated Row type so each field keeps its original nullability (title is
 * string, latitude is number|null, etc) — a Partial<> would over-widen
 * everything to `| undefined` and break consumers like `MapListing`.
 * listing_images is only populated when `withImages` is true (fallback
 * branch omits the join).
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

const getTodayDate = (): string => {
  return new Date().toISOString().split("T")[0];
};

const getDailyAuctionPoolTag = (date = getTodayDate()): string => `auction_pool:${date}`;

const getAuctionSelect = (withImages: boolean): string => {
  return withImages ? `${AUCTION_SELECT_CORE}, listing_images(url, sort_order)` : AUCTION_SELECT_CORE;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const normalizeAuctionFetchLimit = (maxRows?: number): number => {
  if (!Number.isFinite(maxRows)) return PORTAL_AUCTION_FETCH_LIMIT;
  return Math.max(1, Math.min(PORTAL_AUCTION_FETCH_LIMIT, Math.floor(Number(maxRows))));
};

const hasCompleteAuctionPage = (rows: AuctionListingRow[], pageSize: number): boolean => {
  return rows.length === pageSize;
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

const fetchAuctionPageFromDatabase = async (
  today: string,
  withImages: boolean,
  from: number,
  pageSize: number,
  requiredTags: string[],
): Promise<AuctionListingRow[]> => {
  const { data, error } = await supabase
    .from("listings")
    .select(getAuctionSelect(withImages))
    .eq("listing_type", "auction")
    .eq("status", "active")
    .eq("is_off_market", false)
    .contains("tags", requiredTags)
    .or(`auction_date.gte.${today},auction_date.is.null`)
    .order("updated_at", { ascending: false })
    .order("is_featured", { ascending: false })
    .order("priority_placement", { ascending: false })
    .order("auction_date", { ascending: true, nullsFirst: false })
    .range(from, from + pageSize - 1);

  if (error) throw error;
  return (data ?? []) as unknown as AuctionListingRow[];
};

const fetchAuctionFallbackPageRange = async (
  today: string,
  withImages: boolean,
  from: number,
  remainingRows: number,
  allAuctions: AuctionListingRow[],
  requiredTags: string[],
): Promise<AuctionListingRow[]> => {
  if (remainingRows <= 0) return allAuctions;

  const pageSize = Math.min(AUCTION_FETCH_LIMIT, remainingRows);
  const rows = await fetchAuctionPageFromDatabase(today, withImages, from, pageSize, requiredTags);
  const nextAuctions = allAuctions.concat(rows);

  return hasCompleteAuctionPage(rows, pageSize)
    ? fetchAuctionFallbackPageRange(today, withImages, from + pageSize, remainingRows - rows.length, nextAuctions, requiredTags)
    : nextAuctions;
};

const fetchAuctionsFromDatabase = (
  today: string,
  withImages: boolean,
  maxRows = PORTAL_AUCTION_FETCH_LIMIT,
  requiredTags = [OS_AUCTION_SOURCE_TAG, getDailyAuctionPoolTag(today)],
): Promise<AuctionListingRow[]> => {
  return fetchAuctionFallbackPageRange(today, withImages, 0, maxRows, [], requiredTags);
};

const fetchAuctionByDatabaseId = async (
  id: string,
  today: string,
  withImages: boolean,
): Promise<AuctionListingRow | null> => {
  if (!UUID_RE.test(id)) return null;

  const { data, error } = await supabase
    .from("listings")
    .select(getAuctionSelect(withImages))
    .eq("id", id)
    .eq("listing_type", "auction")
    .eq("status", "active")
    .eq("is_off_market", false)
    .or(`auction_date.gte.${today},auction_date.is.null`)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as unknown as AuctionListingRow | null;
};

const fetchAuctionByOsTag = async (
  id: string,
  today: string,
  withImages: boolean,
): Promise<AuctionListingRow | null> => {
  const { data, error } = await supabase
    .from("listings")
    .select(getAuctionSelect(withImages))
    .eq("listing_type", "auction")
    .eq("status", "active")
    .eq("is_off_market", false)
    .contains("tags", [`os_auction:${id}`])
    .or(`auction_date.gte.${today},auction_date.is.null`)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as unknown as AuctionListingRow | null;
};

const fetchAuctionByIdFromDatabase = async (
  id: string,
  today: string,
  withImages: boolean,
): Promise<AuctionListingRow | null> => {
  return await fetchAuctionByDatabaseId(id, today, withImages)
    ?? await fetchAuctionByOsTag(id, today, withImages);
};

export const fetchAuctionListingById = async (id: string): Promise<AuctionListingRow | null> => {
  const auctionId = id.trim();
  if (!auctionId) return null;

  const today = getTodayDate();
  try {
    return await fetchAuctionByIdFromDatabase(auctionId, today, true);
  } catch (_withImagesErr: unknown) {
    return fetchAuctionByIdFromDatabase(auctionId, today, false);
  }
};

const fetchFallbackAuctions = async (today: string, maxRows: number): Promise<AuctionListingRow[]> => {
  const dailyPoolTags = [OS_AUCTION_SOURCE_TAG, getDailyAuctionPoolTag(today)];
  const sourceTags = [OS_AUCTION_SOURCE_TAG];
  try {
    const dailyRows = await fetchAuctionsFromDatabase(today, true, maxRows, dailyPoolTags);
    if (dailyRows.length > 0) return dailyRows;
    return await fetchAuctionsFromDatabase(today, true, maxRows, sourceTags);
  } catch (_dbJoinErr: unknown) {
    const dailyRows = await fetchAuctionsFromDatabase(today, false, maxRows, dailyPoolTags);
    if (dailyRows.length > 0) return dailyRows;
    return fetchAuctionsFromDatabase(today, false, maxRows, sourceTags);
  }
};

const randomizeAndLimitAuctionRows = (rows: AuctionListingRow[], maxRows: number): AuctionListingRow[] =>
  randomizeAuctionPresentation(rows).slice(0, maxRows);

const fetchAuctionListings = async (maxRows: number): Promise<AuctionListingRow[]> => {
  const today = getTodayDate();
  const sourceRows = PORTAL_AUCTION_FETCH_LIMIT;
  let cachedRows: AuctionListingRow[] = [];

  try {
    cachedRows = await fetchFallbackAuctions(today, sourceRows);
    return randomizeAndLimitAuctionRows(cachedRows, maxRows);
  } catch (dbErr: unknown) {
    if (cachedRows.length > 0) return randomizeAndLimitAuctionRows(cachedRows, maxRows);
    throw dbErr;
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
