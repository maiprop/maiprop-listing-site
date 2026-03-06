import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useProfessionals(category?: string) {
  return useQuery({
    queryKey: ["professionals", category],
    queryFn: async () => {
      let query = supabase
        .from("professionals")
        .select("*, profiles!professionals_user_id_fkey(display_name, first_name, last_name)")
        .order("rating", { ascending: false });
      if (category) query = query.eq("category", category as any);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });
}
