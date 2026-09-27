import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Enums, Tables } from "@/integrations/supabase/types";
import { accountQueryKey } from "@/lib/identityQueryBoundary";
import { CATALOG_STATIC_QUERY_STALE_TIME, USER_SCOPED_QUERY_STALE_TIME } from "@/lib/queryCachePolicy";

export type PublicProfessional = Omit<
  Tables<"professionals">,
  "archived_at" | "calendar_notes" | "notes" | "rejection_reason"
>;

type PublicProfessionalView =
  Database["public"]["Views"]["public_professionals"]["Row"];

const toPublicProfessional = (
  row: PublicProfessionalView,
): PublicProfessional => {
  if (
    row.id === null ||
    row.user_id === null ||
    row.title === null ||
    row.category === null ||
    row.verified === null ||
    row.created_at === null ||
    row.updated_at === null
  ) {
    throw new Error("Public professional projection returned an invalid row");
  }

  // PostgreSQL view metadata loses source-column NOT NULL constraints. The
  // runtime checks above restore those guarantees at the client boundary.
  return row as PublicProfessional;
};

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function useProfessionals(category?: string) {
  return useQuery({
    queryKey: ["professionals", category],
    queryFn: async () => {
      let query = supabase
        .from("public_professionals")
        .select("id, user_id, title, display_name, category, city, bio, avatar_url, rating, reviews_count, verified, verified_at, hourly_rate, experience_years, specialties, languages, license_number, website_url, video_link, projects_count, average_deal_size, average_portfolio_asset_size, subscription_tier, created_at, updated_at")
        .order("subscription_tier", { ascending: false, nullsFirst: false })
        .order("rating", { ascending: false, nullsFirst: false });
      if (category) query = query.eq("category", category as Enums<"professional_category">);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(toPublicProfessional);
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
        .from("public_professionals")
        .select("id, user_id, title, display_name, category, city, bio, avatar_url, rating, reviews_count, verified, verified_at, hourly_rate, experience_years, specialties, languages, license_number, website_url, video_link, projects_count, average_deal_size, average_portfolio_asset_size, subscription_tier, created_at, updated_at")
        .eq("id", id)
        .single();
      if (error) throw error;
      if (!data) throw new Error("Professional not found");
      return toPublicProfessional(data);
    },
    enabled: !!id,
    staleTime: CATALOG_STATIC_QUERY_STALE_TIME,
  });
}

export function useRelatedProfessionals(
  currentId: string | undefined,
  category: Enums<"professional_category"> | null | undefined,
) {
  return useQuery({
    queryKey: ["related-professionals", category, currentId],
    queryFn: async () => {
      if (!currentId || !category) throw new Error("Current professional is required");
      const { data, error } = await supabase
        .from("public_professionals")
        .select("id, display_name, avatar_url, city")
        .eq("category", category)
        .neq("id", currentId)
        .order("subscription_tier", { ascending: false, nullsFirst: false })
        .order("rating", { ascending: false, nullsFirst: false })
        .order("id", { ascending: true })
        .limit(3);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentId && !!category,
    staleTime: CATALOG_STATIC_QUERY_STALE_TIME,
  });
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function useProfessionalByUserId(userId: string | undefined) {
  return useQuery({
    queryKey: accountQueryKey(userId, "professional-by-user"),
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
