import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Enums } from "@/integrations/supabase/types";
import { CATALOG_STATIC_QUERY_STALE_TIME, USER_SCOPED_QUERY_STALE_TIME } from "@/lib/queryCachePolicy";

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function useProfessionals(category?: string) {
  return useQuery({
    queryKey: ["professionals", category],
    queryFn: async () => {
      let query = supabase
        .from("professionals")
        .select("id, user_id, title, display_name, category, city, bio, avatar_url, rating, reviews_count, verified, verified_at, rejection_reason, hourly_rate, experience_years, specialties, languages, license_number, website_url, video_link, projects_count, average_deal_size, average_portfolio_asset_size, subscription_tier, calendar_notes, archived_at, created_at, updated_at")
        .is("archived_at", null)
        .order("subscription_tier", { ascending: false, nullsFirst: false })
        .order("rating", { ascending: false, nullsFirst: false });
      if (category) query = query.eq("category", category as Enums<"professional_category">);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: CATALOG_STATIC_QUERY_STALE_TIME,
  });
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function useProfessional(id: string) {
  return useQuery({
    queryKey: ["professional", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("id, user_id, title, display_name, category, city, bio, avatar_url, rating, reviews_count, verified, verified_at, rejection_reason, hourly_rate, experience_years, specialties, languages, license_number, website_url, video_link, projects_count, average_deal_size, average_portfolio_asset_size, subscription_tier, calendar_notes, notes, archived_at, created_at, updated_at")
        .eq("id", id)
        .is("archived_at", null)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
    staleTime: CATALOG_STATIC_QUERY_STALE_TIME,
  });
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function useProfessionalByUserId(userId: string | undefined) {
  return useQuery({
    queryKey: ["professional-by-user", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("professionals")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    staleTime: USER_SCOPED_QUERY_STALE_TIME,
  });
}
