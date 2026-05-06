import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

const AUCTION_SELECT_CORE = "id, title, city, address, price, auction_starting_bid, auction_date, auction_court, property_type, cover_image_url, sqm, bedrooms, bathrooms, latitude, longitude, tags, year_built, construction_status, website_url, region, is_featured, priority_placement";
const QUERY_TIMEOUT_MS = 15_000;
const AUCTION_FETCH_LIMIT = 500;
const PORTAL_AUCTION_FETCH_LIMIT = 600;

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

const getTodayDate = (): string => new Date().toISOString().split("T")[0];

const getAuctionSelect = (withImages: boolean): string =>
  withImages ? `${AUCTION_SELECT_CORE}, listing_images(url, sort_order)` : AUCTION_SELECT_CORE;

const hasCompleteAuctionPage = (rows: AuctionListingRow[], pageSize: number): boolean =>
  rows.length === pageSize;

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

const fetchAuctionsFromDatabase = async (
  today: string,
  withImages: boolean,
  maxRows = PORTAL_AUCTION_FETCH_LIMIT,
): Promise<AuctionListingRow[]> => {
  const allAuctions: AuctionListingRow[] = [];
  let from = 0;

  while (allAuctions.length < maxRows) {
    const pageSize = Math.min(AUCTION_FETCH_LIMIT, maxRows - allAuctions.length);
    const rows = await fetchAuctionPageFromDatabase(today, withImages, from, pageSize);
    allAuctions.push(...rows);
    from += pageSize;
    if (!hasCompleteAuctionPage(rows, pageSize)) break;
  }

  return allAuctions;
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
    return await fetchAuctionsFromOs(today);
  } catch (_osErr: unknown) {
    return fetchFallbackAuctions(today);
  }
};

const getTimeoutRejection = (): Promise<never> =>
  new Promise((_, reject) => setTimeout(() => reject(new Error("Request timeout")), QUERY_TIMEOUT_MS));

const withAuctionTimeout = (
  request: Promise<AuctionListingRow[]>,
): Promise<AuctionListingRow[]> =>
  Promise.race([request, getTimeoutRejection()]);

export const useAuctionListings = () =>
  useQuery({
    queryKey: ["auction-listings-all"],
    queryFn: () => withAuctionTimeout(fetchAuctionListings()),
    staleTime: 30_000, // 30s — auction status changes frequently
  });
