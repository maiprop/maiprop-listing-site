import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FAST_CHANGING_QUERY_STALE_TIME } from "@/lib/queryCachePolicy";

/** Views per day for the last N days for my listings */
export function useListingViewTrends(listingIds: string[], days = 14) {
  const from = new Date();
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);

  return useQuery({
    queryKey: ["listing_view_trends", listingIds, days],
    queryFn: async () => {
      if (listingIds.length === 0) return [];
      const { data, error } = await supabase
        .from("listing_view_events")
        .select("listing_id, viewed_at")
        .in("listing_id", listingIds)
        .gte("viewed_at", from.toISOString());
      if (error) throw error;
      const list = data || [];
      const byDay: Record<string, number> = {};
      list.forEach((r: { viewed_at: string }) => {
        const d = r.viewed_at.slice(0, 10);
        byDay[d] = (byDay[d] || 0) + 1;
      });
      return Object.entries(byDay)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));
    },
    enabled: listingIds.length > 0,
    staleTime: FAST_CHANGING_QUERY_STALE_TIME,
  });
}

/** Lead funnel: counts by status for consultation_requests */
export function useLeadFunnel(professionalId: string | undefined) {
  return useQuery({
    queryKey: ["lead_funnel", professionalId],
    queryFn: async () => {
      if (!professionalId) return { pending: 0, reviewed: 0, confirmed: 0, cancelled: 0, total: 0 };
      const { data, error } = await supabase
        .from("consultation_requests")
        .select("status")
        .eq("professional_id", professionalId);
      if (error) throw error;
      const list = data || [];
      const counts: Record<string, number> = {};
      list.forEach((r: { status: string }) => {
        counts[r.status] = (counts[r.status] || 0) + 1;
      });
      const pending = counts.pending || 0;
      const reviewed = counts.reviewed || 0;
      const confirmed = counts.confirmed || 0;
      const cancelled = counts.cancelled || 0;
      return {
        pending,
        reviewed,
        confirmed,
        cancelled,
        total: list.length,
        conversionRate: list.length > 0 ? Math.round((confirmed / list.length) * 100) : 0,
      };
    },
    enabled: !!professionalId,
    staleTime: FAST_CHANGING_QUERY_STALE_TIME,
  });
}
