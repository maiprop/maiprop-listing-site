/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const AUCTION_SELECT_CORE = "id, title, city, address, price, auction_starting_bid, auction_date, auction_court, property_type, cover_image_url, sqm, bedrooms, bathrooms, latitude, longitude, tags, year_built, construction_status, website_url, region, is_featured, priority_placement";
const QUERY_TIMEOUT_MS = 15_000;
const AUCTION_FETCH_LIMIT = 500;

export function useAuctionListings() {
  return useQuery({
    queryKey: ["auction-listings-all"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];

       
      const fetchAll = async (withImages: boolean): Promise<any[]> => {
         
        let allAuctions: any[] = [];
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
          allAuctions = allAuctions.concat(data);
          if (data.length < AUCTION_FETCH_LIMIT) break;
          from += AUCTION_FETCH_LIMIT;
        }
        return allAuctions;
      };

       
      const run = async (): Promise<any[]> => {
        let result: any[];
        try {
          result = await fetchAll(true);
        } catch (_err: unknown) {
          result = await fetchAll(false);
        }
        return result;
      };

      return Promise.race([
        run(),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Request timeout")), QUERY_TIMEOUT_MS)),
      ]);
    },
    staleTime: 60 * 1000, // 1 minute — auction status changes frequently
  });
}
