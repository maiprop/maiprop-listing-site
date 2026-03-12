import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export function useListings(filters?: {
  city?: string;
  listing_type?: string;
  property_type?: string;
  status?: string;
  owner_id?: string;
}) {
  return useQuery({
    queryKey: ["listings", filters],
    queryFn: async () => {
      let query = supabase
        .from("listings")
        .select(`
          *,
          listing_images(url, sort_order)
        `)
        .order("created_at", { ascending: false });

      if (filters?.city) query = query.ilike("city", `%${filters.city}%`);
      if (filters?.listing_type) query = query.eq("listing_type", filters.listing_type as any);
      if (filters?.property_type) query = query.eq("property_type", filters.property_type as any);
      if (filters?.owner_id) query = query.eq("owner_id", filters.owner_id);
      if (!filters?.owner_id) query = query.eq("status", (filters?.status || "active") as any);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });
}

export function useListing(id: string) {
  return useQuery({
    queryKey: ["listing", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select(`
          *,
          listing_images(url, sort_order)
        `)
        .eq("id", id)
        .single();
      if (error) throw error;
      // Increment view count (fire-and-forget)
      supabase.from("listings").update({ views_count: (data?.views_count || 0) + 1 }).eq("id", id);
      // Fetch owner profile and Pro status (Pro owners can receive messages and calendar)
      let profiles = null;
      let ownerIsPro = false;
      if (data?.owner_id) {
        const [{ data: profile }, { data: sub }] = await Promise.all([
          supabase.from("profiles").select("*").eq("user_id", data.owner_id).maybeSingle(),
          supabase.from("investor_subscriptions").select("tier, status").eq("user_id", data.owner_id).order("started_at", { ascending: false }).limit(1).maybeSingle(),
        ]);
        profiles = profile ?? null;
        ownerIsPro = !!(sub?.status === "active" && (sub?.tier || "").toLowerCase() === "pro");
      }
      return { ...data, profiles, ownerIsPro };
    },
    enabled: !!id,
  });
}

export function useCreateListing() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (listing: {
      title: string; city: string; price: number; sqm: number;
      property_type: string; listing_type: string; description?: string;
      address?: string; bedrooms?: number; bathrooms?: number;
      cover_image_url?: string; tags?: string[];
      auction_date?: string; auction_starting_bid?: number;
    }) => {
      if (!user) throw new Error("Must be logged in");
      const { data, error } = await supabase
        .from("listings")
        .insert({ ...listing, owner_id: user.id, status: "active" } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["listings"] });
      toast.success("Listing published successfully!");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
      const { data, error } = await supabase
        .from("listings")
        .update(updates as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["listings"] });
      queryClient.invalidateQueries({ queryKey: ["listing", id] });
      toast.success("Listing updated!");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("listings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["listings"] });
      toast.success("Listing deleted.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useMyListings() {
  const { user } = useAuth();
  return useListings({ owner_id: user?.id });
}
