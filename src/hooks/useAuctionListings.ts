import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

const AUCTION_SELECT_CORE = "id, title, city, address, price, auction_starting_bid, auction_date, auction_court, property_type, cover_image_url, sqm, bedrooms, bathrooms, latitude, longitude, tags, year_built, construction_status, website_url, region, is_featured, priority_placement";
const QUERY_TIMEOUT_MS = 15_000;
const AUCTION_FETCH_LIMIT = 500;

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

export function useAuctionListings() {
  return useQuery({
    queryKey: ["auction-listings-all"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];

      const fetchAll = async (withImages: boolean): Promise<AuctionListingRow[]> => {
        let allAuctions: AuctionListingRow[] = [];
        let from = 0;
        while (true) {
          const select = withImages
            ? `${AUCTION_SELECT_CORE}, listing_images(url, sort_order)`
            : AUCTION_SELECT_CORE;
          const { data, error } = await supabase
            .from("listings")
            .select(select)
            .eq("listing_type", "auction")
            .eq("status", "active")
            .or(`auction_date.gte.${today},auction_date.is.null`)
            .order("is_featured", { ascending: false })
            .order("priority_placement", { ascending: false })
            .order("auction_date", { ascending: true, nullsFirst: false })
            .range(from, from + AUCTION_FETCH_LIMIT - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          allAuctions = allAuctions.concat(data as unknown as AuctionListingRow[]);
          if (data.length < AUCTION_FETCH_LIMIT) break;
          from += AUCTION_FETCH_LIMIT;
        }
        return allAuctions;
      };

      const run = async (): Promise<AuctionListingRow[]> => {
        try {
          return await fetchAll(true);
        } catch (_err: unknown) {
          return await fetchAll(false);
        }
      };

      return Promise.race([
        run(),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Request timeout")), QUERY_TIMEOUT_MS)),
      ]);
    },
    staleTime: 30_000, // 30s — auction status changes frequently
  });
}
