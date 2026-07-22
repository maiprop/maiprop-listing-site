import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { USER_SCOPED_QUERY_STALE_TIME } from "@/lib/queryCachePolicy";
import {
  parseMutationInput,
  portfolioIdSchema,
  portfolioNameSchema,
  portfolioUpdateMutationSchema,
} from "@/lib/mutationSchemas";

/** A portfolio row as returned by the list/detail queries. */
export type Portfolio = Pick<
  Database["public"]["Tables"]["portfolios"]["Row"],
  "id" | "name" | "listing_ids" | "user_id" | "created_at" | "updated_at"
>;

/** A listing summary attached to a portfolio detail (subset of fields needed by PropertyCard). */
export type PortfolioListing = Pick<
  Database["public"]["Tables"]["listings"]["Row"],
  "id" | "title" | "city" | "price" | "sqm" | "property_type" | "cover_image_url" | "listing_type" | "status"
>;

/** The shape returned by usePortfolio() — the portfolio plus its listings array. */
export type PortfolioWithListings = Portfolio & { listings: PortfolioListing[] };

export function usePortfolios() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["portfolios", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("portfolios")
        .select("id, name, listing_ids, user_id, created_at, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: USER_SCOPED_QUERY_STALE_TIME,
  });
}

export function usePortfolio(id: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["portfolio", user?.id, id],
    queryFn: async () => {
      if (!id || !user) return null;
      const { data: portfolio, error: pe } = await supabase
        .from("portfolios")
        .select("id, name, listing_ids, user_id, created_at, updated_at")
        .eq("id", id)
        .single();
      if (pe || !portfolio) throw pe || new Error("Not found");

      const ids = (portfolio.listing_ids as string[]) || [];
      if (ids.length === 0) return { ...portfolio, listings: [] };

      const { data: listings, error: le } = await supabase
        .from("public_listing_catalogue")
        .select("id, title, city, price, sqm, property_type, cover_image_url, listing_type, status")
        .in("id", ids);
      if (le) throw le;

      const portfolioListings = (listings ?? []).filter(
        (listing) => Boolean(listing.id),
      ) as unknown as PortfolioListing[];
      const byId = Object.fromEntries(portfolioListings.map((listing) => [listing.id, listing]));
      const ordered = ids.map((id) => byId[id]).filter(Boolean);
      return { ...portfolio, listings: ordered };
    },
    enabled: Boolean(id && user),
    staleTime: USER_SCOPED_QUERY_STALE_TIME,
  });
}

export function useCreatePortfolio() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (name: string) => {
      if (!user) throw new Error("Not authenticated");
      const portfolioName = parseMutationInput(portfolioNameSchema, name, "portfolio name");
      const { data, error } = await supabase
        .from("portfolios")
        .insert({ name: portfolioName, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portfolios"] });
      toast.success("Portfolio created");
    },
    onError: () => toast.error("Failed to create portfolio. Please try again."),
  });
}

export function useUpdatePortfolio() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: { name?: string; listing_ids?: string[] };
    }) => {
      if (!user) throw new Error("Must be logged in");
      const payload = parseMutationInput(
        portfolioUpdateMutationSchema,
        { id, updates },
        "portfolio update",
      );
      const { data, error } = await supabase
        .from("portfolios")
        .update(payload.updates)
        .eq("id", payload.id)
        .eq("user_id", user.id)
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
    onError: () => toast.error("Failed to update portfolio. Please try again."),
  });
}

export function useDeletePortfolio() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Must be logged in");
      const portfolioId = parseMutationInput(portfolioIdSchema, id, "portfolio id");
      const { error } = await supabase.from("portfolios").delete().eq("id", portfolioId).eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portfolios"] });
      toast.success("Portfolio deleted");
    },
    onError: () => toast.error("Failed to delete portfolio. Please try again."),
  });
}
