import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

const AUCTION_SELECT_CORE = "id, title, city, address, price, auction_starting_bid, auction_date, auction_court, property_type, cover_image_url, sqm, bedrooms, bathrooms, latitude, longitude, tags, year_built, construction_status, website_url, region, is_featured, priority_placement";
const QUERY_TIMEOUT_MS = 15_000;
const AUCTION_FETCH_LIMIT = 500;
const PORTAL_AUCTION_FETCH_LIMIT = 600;
const AUCTION_RANDOMIZATION_SALT = "maiprop-auctions-v1";

/**
 * Shape returned by the fetchAll helper. Columns are a Pick<> against the
 * generated Row type so each field keeps its original nullability (title is
 * string, latitude is number|null, etc) — a Partial<> would over-widen
 * everything to `| undefined` and break consumers like `MapListing`.
 * listing_images is only populated when `withImages` is true (fallback
 * branch omits the join).
 */
type AuctionListingRow = Pick<
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

const getAuctionSelect = (withImages: boolean): string => {
  return withImages ? `${AUCTION_SELECT_CORE}, listing_images(url, sort_order)` : AUCTION_SELECT_CORE;
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
): Promise<AuctionListingRow[]> => {
  const { data, error } = await supabase
    .from("listings")
    .select(getAuctionSelect(withImages))
    .eq("listing_type", "auction")
    .eq("status", "active")
    .or(`auction_date.gte.${today},auction_date.is.null`)
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
): Promise<AuctionListingRow[]> => {
  if (remainingRows <= 0) return allAuctions;

  const pageSize = Math.min(AUCTION_FETCH_LIMIT, remainingRows);
  const rows = await fetchAuctionPageFromDatabase(today, withImages, from, pageSize);
  const nextAuctions = allAuctions.concat(rows);

  return hasCompleteAuctionPage(rows, pageSize)
    ? fetchAuctionFallbackPageRange(today, withImages, from + pageSize, remainingRows - rows.length, nextAuctions)
    : nextAuctions;
};

const fetchAuctionsFromDatabase = (
  today: string,
  withImages: boolean,
  maxRows = PORTAL_AUCTION_FETCH_LIMIT,
): Promise<AuctionListingRow[]> => {
  return fetchAuctionFallbackPageRange(today, withImages, 0, maxRows, []);
};

const fetchAuctionsFromOs = async (today: string): Promise<AuctionListingRow[]> => {
  const { data, error } = await supabase.functions.invoke("fetch-os-auctions", {
    body: {
      auctionDateFrom: today,
      page: 0,
      pageSize: PORTAL_AUCTION_FETCH_LIMIT,
      sortBy: "AUCTION_DATE",
      order: "ASC",
    },
  });

  if (error) throw error;

  const rows = data?.data;
  if (!Array.isArray(rows)) throw new Error("Unexpected OS auctions response");
  return rows as AuctionListingRow[];
};

const fetchFallbackAuctions = async (today: string): Promise<AuctionListingRow[]> => {
  try {
    return await fetchAuctionsFromDatabase(today, true);
  } catch (_dbJoinErr: unknown) {
    return fetchAuctionsFromDatabase(today, false);
  }
};

const fetchAuctionListings = async (): Promise<AuctionListingRow[]> => {
  const today = getTodayDate();
  try {
    return randomizeAuctionPresentation(await fetchAuctionsFromOs(today));
  } catch (_osErr: unknown) {
    return randomizeAuctionPresentation(await fetchFallbackAuctions(today));
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

const getAuctionQuery = (): Promise<AuctionListingRow[]> => {
  return withAuctionTimeout(fetchAuctionListings());
};

export const useAuctionListings = () => {
  return useQuery({
    queryKey: ["auction-listings-all"],
    queryFn: getAuctionQuery,
    staleTime: 30_000, // 30s — auction status changes frequently
  });
};
