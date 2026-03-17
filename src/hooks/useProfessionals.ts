import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useProfessionals(category?: string) {
  return useQuery({
    queryKey: ["professionals", category],
    queryFn: async () => {
      let query = supabase
        .from("professionals")
        .select("*")
        .order("rating", { ascending: false });
      if (category) query = query.eq("category", category as any);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });
}

export function useProfessional(id: string) {
  return useQuery({
    queryKey: ["professional", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

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
  });
}
