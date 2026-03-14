import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export function usePortfolios() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["portfolios", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portfolios")
        .select("*")
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });
}

export function usePortfolio(id: string | undefined) {
  return useQuery({
    queryKey: ["portfolio", id],
    queryFn: async () => {
      if (!id) return null;
      const { data: portfolio, error: pe } = await supabase
        .from("portfolios")
        .select("*")
        .eq("id", id)
        .single();
      if (pe || !portfolio) throw pe || new Error("Not found");

      const ids = (portfolio.listing_ids as string[]) || [];
      if (ids.length === 0) return { ...portfolio, listings: [] };

      const { data: listings, error: le } = await supabase
        .from("listings")
        .select("id, title, city, price, sqm, property_type, cover_image_url, listing_type")
        .in("id", ids)
        .eq("status", "active");
      if (le) return { ...portfolio, listings: [] };

      const byId = Object.fromEntries((listings || []).map((l: any) => [l.id, l]));
      const ordered = ids.map((id) => byId[id]).filter(Boolean);
      return { ...portfolio, listings: ordered };
    },
    enabled: !!id,
  });
}

export function useCreatePortfolio() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from("portfolios")
        .insert({ name, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portfolios"] });
      toast.success("Portfolio created");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdatePortfolio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: { name?: string; listing_ids?: string[] };
    }) => {
      const { data, error } = await supabase
        .from("portfolios")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["portfolios"] });
      qc.invalidateQueries({ queryKey: ["portfolio", id] });
      toast.success("Portfolio updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeletePortfolio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("portfolios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portfolios"] });
      toast.success("Portfolio deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
