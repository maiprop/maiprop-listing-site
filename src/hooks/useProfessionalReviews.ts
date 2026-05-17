import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { CATALOG_STATIC_QUERY_STALE_TIME } from "@/lib/queryCachePolicy";

export interface ProfessionalReview {
  id: string;
  professional_id: string;
  reviewer_id: string;
  rating: number;
  title: string | null;
  body: string | null;
  service_type: string | null;
  property_city: string | null;
  transaction_year: number | null;
  recommended: boolean;
  created_at: string;
  reviewer?: {
    display_name: string | null;
    avatar_url: string | null;
  };
}

export interface ReviewStats {
  avg: number;
  total: number;
  recommended_pct: number;
  by_star: Record<1 | 2 | 3 | 4 | 5, number>;
}

export function computeStats(reviews: ProfessionalReview[]): ReviewStats {
  if (reviews.length === 0) {
    return { avg: 0, total: 0, recommended_pct: 0, by_star: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
  }
  const by_star = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;
  let sum = 0;
  let recommended = 0;
  for (const r of reviews) {
    by_star[r.rating as 1 | 2 | 3 | 4 | 5]++;
    sum += r.rating;
    if (r.recommended) recommended++;
  }
  return {
    avg: Math.round((sum / reviews.length) * 10) / 10,
    total: reviews.length,
    recommended_pct: Math.round((recommended / reviews.length) * 100),
    by_star,
  };
}

export function useProfessionalReviews(professionalId: string) {
  return useQuery({
    queryKey: ["professional-reviews", professionalId],
    enabled: !!professionalId,
    staleTime: CATALOG_STATIC_QUERY_STALE_TIME,
    queryFn: async (): Promise<ProfessionalReview[]> => {
      type ReviewRow = Omit<ProfessionalReview, "reviewer"> & {
        profiles: { display_name: string | null; avatar_url: string | null } | null;
      };
      const { data, error } = await supabase.from("professional_reviews")
        .select(`
          id, professional_id, reviewer_id, rating, title, body,
          service_type, property_city, transaction_year, recommended, created_at,
          profiles:reviewer_id ( display_name, avatar_url )
        `)
        .eq("professional_id", professionalId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as ReviewRow[]).map(({ profiles, ...rest }) => ({
        ...rest,
        reviewer: profiles ?? undefined,
      }));
    },
  });
}

export function useSubmitReview(professionalId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      rating: number;
      title: string;
      body: string;
      service_type: string;
      property_city: string;
      transaction_year: number;
      recommended: boolean;
    }) => {
      if (!user) throw new Error("Sign in to leave a review.");
      const { error } = await supabase.from("professional_reviews").upsert(
        { ...payload, professional_id: professionalId, reviewer_id: user.id },
        { onConflict: "professional_id,reviewer_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["professional-reviews", professionalId] });
      toast.success("Review submitted.");
    },
    onError: () => toast.error("Could not submit review. Please try again."),
  });
}
