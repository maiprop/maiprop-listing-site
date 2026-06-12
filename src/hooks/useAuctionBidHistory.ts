/**
 * useAuctionBidHistory
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches comparable sales near a coordinate pair via the os-sales-coordinates
 * Supabase edge function. The function proxies the maiProp OS API and fails
 * closed when OS is not configured with an HTTPS endpoint.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SaleRecord = {
  id: string;
  address: string;
  lat: number;
  lng: number;
  sale_price: number;
  asking_price: number;
  sale_date: string;
  property_type: string;
  sqm: number;
  bedrooms: number;
  status: string;
  discount_pct: number;
  source: string;
  round: number;
  /** @deprecated kept for backward compat with old consumers; prefer sale_price/sqm */
  days_on_market?: number;
};

export type AuctionBidHistoryResult = {
  sales: SaleRecord[];
  /** "os" when live data was returned, "mock" only for explicitly marked sample payloads */
  dataSource: "os" | "mock";
};

export function useAuctionBidHistory(
  lat?: number,
  lon?: number,
  radius = 1.5,
): ReturnType<typeof useQuery<AuctionBidHistoryResult>> {
  return useQuery<AuctionBidHistoryResult>({
    queryKey: ["auction_bid_history", lat, lon, radius],
    queryFn: async (): Promise<AuctionBidHistoryResult> => {
      const resolvedLat = lat ?? 37.9838;
      const resolvedLng = lon ?? 23.7275;

      const { data, error } = await supabase.functions.invoke<{
        data: SaleRecord[];
        source: "os" | "mock";
        error?: string;
      }>("os-sales-coordinates", {
        body: { lat: resolvedLat, lng: resolvedLng, radius_km: radius, limit: 30 },
      });

      if (error) throw new Error(error.message ?? "Failed to fetch comparable sales");
      if (!data) throw new Error("Empty response from os-sales-coordinates");

      return {
        sales: Array.isArray(data.data) ? data.data : [],
        dataSource: data.source ?? "mock",
      };
    },
    staleTime: 30_000, // 30s — bid history can change rapidly during live auctions
    retry: 1,
  });
}
