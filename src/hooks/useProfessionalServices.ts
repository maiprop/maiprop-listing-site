import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { CATALOG_STATIC_QUERY_STALE_TIME, USER_SCOPED_QUERY_STALE_TIME } from "@/lib/queryCachePolicy";

export interface ProfessionalService {
  id: string;
  professional_id: string;
  service_key: string;
  service_name: string;
  description: string | null;
  category: string;
  pricing_model: string;
  rate_amount: number | null;
  currency: string;
  estimated_hours: number | null;
  video_enabled: boolean;
  is_premium: boolean;
  is_active: boolean;
}

export interface ProfessionalAvailability {
  id: string;
  professional_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

const requireSameProfessional = <T extends { professional_id: string }>(
  professionalId: string,
  rows: T[],
  label: string,
): void => {
  if (rows.some((row) => row.professional_id !== professionalId)) {
    throw new Error(`Cannot update ${label} for another professional`);
  }
};

export function useProfessionalServices(professionalId: string) {
  return useQuery({
    queryKey: ["professional_services", professionalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professional_services")
        .select("id, professional_id, service_key, service_name, description, category, pricing_model, rate_amount, currency, estimated_hours, video_enabled, is_premium, is_active, created_at, updated_at")
        .eq("professional_id", professionalId)
        .eq("is_active", true)
        .order("service_name");
      if (error) throw error;
      return (data || []) as ProfessionalService[];
    },
    enabled: !!professionalId,
    staleTime: CATALOG_STATIC_QUERY_STALE_TIME,
  });
}

export function useProfessionalAvailability(professionalId: string) {
  return useQuery({
    queryKey: ["professional_availability", professionalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professional_availability")
        .select("id, professional_id, day_of_week, start_time, end_time, is_active")
        .eq("professional_id", professionalId)
        .eq("is_active", true)
        .order("day_of_week");
      if (error) throw error;
      return (data || []) as ProfessionalAvailability[];
    },
    enabled: !!professionalId,
    staleTime: CATALOG_STATIC_QUERY_STALE_TIME,
  });
}

export function useMyProfessional() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my_professional", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("professionals")
        .select("id, user_id, title, display_name, category, city, bio, avatar_url, rating, reviews_count, verified, hourly_rate, experience_years, specialties, languages, license_number, website_url, video_link, projects_count, average_deal_size, average_portfolio_asset_size, subscription_tier, calendar_notes, created_at, updated_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
    staleTime: USER_SCOPED_QUERY_STALE_TIME,
  });
}

export function useUpsertProfessionalServices() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ professionalId, services }: { professionalId: string; services: Omit<ProfessionalService, "id">[] }) => {
      if (!user) throw new Error("Must be logged in");
      const { data: prof } = await supabase.from("professionals").select("user_id").eq("id", professionalId).eq("user_id", user.id).maybeSingle();
      if (!prof) throw new Error("Unauthorized");
      requireSameProfessional(professionalId, services, "services");
      if (services.length > 0) {
        // Upsert on (professional_id, service_key) — insert or update without gap
        const { error: upsertError } = await supabase
          .from("professional_services")
          .upsert(services, { onConflict: "professional_id,service_key" });
        if (upsertError) throw upsertError;
      }
      // Remove rows not in the new set.
      // PostgREST "in" tuple: plain comma-separated values, no quoting for text.
      const keepKeys = services.map(s => s.service_key);
      const pruneQuery = supabase
        .from("professional_services")
        .delete()
        .eq("professional_id", professionalId);
      const { error: deleteError } = await (
        keepKeys.length > 0
          ? pruneQuery.not("service_key", "in", `(${keepKeys.join(",")})`)
          : pruneQuery
      );
      if (deleteError) throw deleteError;
    },
    onSuccess: (_, { professionalId }) => {
      queryClient.invalidateQueries({ queryKey: ["professional_services", professionalId] });
      toast.success("Services updated!");
    },
    onError: () => toast.error("Failed to update services. Please try again."),
  });
}

export function useUpsertProfessionalAvailability() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ professionalId, availability }: { professionalId: string; availability: Omit<ProfessionalAvailability, "id">[] }) => {
      if (!user) throw new Error("Must be logged in");
      const { data: prof } = await supabase.from("professionals").select("user_id").eq("id", professionalId).eq("user_id", user.id).maybeSingle();
      if (!prof) throw new Error("Unauthorized");
      requireSameProfessional(professionalId, availability, "availability");
      if (availability.length > 0) {
        // Upsert on (professional_id, day_of_week) — insert or update without gap
        const { error: upsertError } = await supabase
          .from("professional_availability")
          .upsert(availability, { onConflict: "professional_id,day_of_week" });
        if (upsertError) throw upsertError;
      }
      // Remove days not in the new set (integers, no quoting needed)
      const keepDays = availability.map(a => a.day_of_week);
      const pruneQuery = supabase
        .from("professional_availability")
        .delete()
        .eq("professional_id", professionalId);
      const { error: deleteError } = await (
        keepDays.length > 0
          ? pruneQuery.not("day_of_week", "in", `(${keepDays.join(",")})`)
          : pruneQuery
      );
      if (deleteError) throw deleteError;
    },
    onSuccess: (_, { professionalId }) => {
      queryClient.invalidateQueries({ queryKey: ["professional_availability", professionalId] });
      toast.success("Availability updated!");
    },
    onError: () => toast.error("Failed to update availability. Please try again."),
  });
}

export function useUpdateProfessional() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: TablesUpdate<"professionals"> }) => {
      if (!user) throw new Error("Must be logged in");
      const { error } = await supabase.from("professionals").update(updates).eq("id", id).eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my_professional", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["professionals"] });
      toast.success("Profile updated!");
    },
    onError: () => toast.error("Failed to update profile. Please try again."),
  });
}
