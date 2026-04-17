import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Enums } from "@/integrations/supabase/types";

/**
 * Fetches similar listings/deals from the database (includes OS-synced auctions).
 * Matches by city, property_type, listing_type; sorts by price proximity.
 */
export function useSimilarListings(params: {
  excludeId?: string;
  city?: string;
  propertyType?: string;
  listingType?: string;
  price?: number;
  limit?: number;
}) {
  const { excludeId, city, propertyType, listingType, price, limit = 8 } = params;

  return useQuery({
    queryKey: ["similar-listings", excludeId, city, propertyType, listingType, price],
    queryFn: async () => {
      if (!city && !propertyType) return [];

      let query = supabase
        .from("listings")
        .select(`*, listing_images(url, sort_order)`)
        .eq("status", "active" as Enums<"listing_status">)
        .limit(200);

      if (excludeId) query = query.neq("id", excludeId);
      if (city) query = query.ilike("city", `%${city}%`);
      if (propertyType) query = query.eq("property_type", propertyType as Enums<"property_type">);
      if (listingType) query = query.eq("listing_type", listingType as Enums<"listing_type">);

      const { data, error } = await query;
      if (error) throw error;
      if (!data?.length) return [];

      // Fetch owner profiles for cards (use profiles_public per RLS; profiles restricted to own row)
      const ownerIds = [...new Set(data.map(r => r.owner_id).filter((id): id is string => !!id))];
      const { data: profiles = [] } = ownerIds.length
        ? await supabase.from("profiles_public").select("user_id, display_name, avatar_url, role").in("user_id", ownerIds)
        : { data: [] };
      const profileMap = new Map((profiles ?? []).map(p => [p.user_id, p]));

      const withProfiles = data.map(r => ({
        ...r,
        profiles: r.owner_id ? profileMap.get(r.owner_id) ?? null : null,
      }));

      // Sort by price proximity when price is provided
      const sorted =
        price != null && price > 0
          ? [...withProfiles].sort((a, b) => {
              const pa = Math.abs((a.price ?? 0) - price);
              const pb = Math.abs((b.price ?? 0) - price);
              return pa - pb;
            })
          : withProfiles;

      return sorted.slice(0, limit);
    },
    enabled: !!(city || propertyType),
  });
}
