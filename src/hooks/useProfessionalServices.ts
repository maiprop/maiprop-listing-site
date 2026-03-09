import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

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

export function useProfessionalServices(professionalId: string) {
  return useQuery({
    queryKey: ["professional_services", professionalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professional_services" as any)
        .select("*")
        .eq("professional_id", professionalId)
        .eq("is_active", true)
        .order("service_name");
      if (error) throw error;
      return (data || []) as unknown as ProfessionalService[];
    },
    enabled: !!professionalId,
  });
}

export function useProfessionalAvailability(professionalId: string) {
  return useQuery({
    queryKey: ["professional_availability", professionalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professional_availability" as any)
        .select("*")
        .eq("professional_id", professionalId)
        .eq("is_active", true)
        .order("day_of_week");
      if (error) throw error;
      return (data || []) as unknown as ProfessionalAvailability[];
    },
    enabled: !!professionalId,
  });
}

export function useMyProfessional() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my_professional", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });
}

export function useUpsertProfessionalServices() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ professionalId, services }: { professionalId: string; services: Omit<ProfessionalService, "id">[] }) => {
      // Delete existing and re-insert
      await supabase.from("professional_services" as any).delete().eq("professional_id", professionalId);
      if (services.length > 0) {
        const { error } = await supabase.from("professional_services" as any).insert(services);
        if (error) throw error;
      }
    },
    onSuccess: (_, { professionalId }) => {
      queryClient.invalidateQueries({ queryKey: ["professional_services", professionalId] });
      toast.success("Services updated!");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpsertProfessionalAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ professionalId, availability }: { professionalId: string; availability: Omit<ProfessionalAvailability, "id">[] }) => {
      await supabase.from("professional_availability" as any).delete().eq("professional_id", professionalId);
      if (availability.length > 0) {
        const { error } = await supabase.from("professional_availability" as any).insert(availability);
        if (error) throw error;
      }
    },
    onSuccess: (_, { professionalId }) => {
      queryClient.invalidateQueries({ queryKey: ["professional_availability", professionalId] });
      toast.success("Availability updated!");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateProfessional() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, any> }) => {
      const { error } = await supabase.from("professionals").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my_professional", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["professionals"] });
      toast.success("Profile updated!");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
