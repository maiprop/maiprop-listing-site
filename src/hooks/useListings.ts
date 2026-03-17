import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { getOwnerParticipantType } from "@/lib/participantConfig";

export type ListingsFilters = {
  city?: string;
  listing_type?: string;
  property_type?: string;
  status?: string;
  owner_id?: string;
  includeAuctions?: boolean;
  limit?: number;
  page?: number;
  pageSize?: number;
  price_min?: number;
  price_max?: number;
  beds_min?: number;
  beds_max?: number;
  baths_min?: number;
  baths_max?: number;
  sqm_min?: number;
  sqm_max?: number;
  floor_min?: number;
  floor_max?: number;
  year_min?: number;
  year_max?: number;
  energy_class?: string[];
  heating_system?: string;
  construction_status?: string;
  commercial_subtype?: string;
  is_pre_sale?: boolean;
  is_off_market?: boolean;
  features?: string[];
  sort?: "featured" | "newest" | "price-asc" | "price-desc" | "ai-score" | "views";
};

function buildListingsQuery(filters?: ListingsFilters, from = 0, pageSize = 500) {
  const sort = filters?.sort ?? "featured";
  let query = supabase
    .from("listings")
    .select(`*, listing_images(url, sort_order)`);

  // Order: featured/priority first, then by user choice
  if (sort === "price-asc") query = query.order("price", { ascending: true });
  else if (sort === "price-desc") query = query.order("price", { ascending: false });
  else if (sort === "newest") query = query.order("created_at", { ascending: false });
  else if (sort === "ai-score") query = query.order("ai_score", { ascending: false, nullsFirst: false });
  else if (sort === "views") query = query.order("views_count", { ascending: false, nullsFirst: false });
  else {
    query = query.order("is_featured", { ascending: false }).order("priority_placement", { ascending: false }).order("created_at", { ascending: false });
  }

  query = query.range(from, from + pageSize - 1);

  if (filters?.city) query = query.ilike("city", `%${filters.city}%`);
  if (filters?.listing_type) {
    query = query.eq("listing_type", filters.listing_type as any);
  } else if (!filters?.includeAuctions) {
    query = query.in("listing_type", ["sale", "rent", "firesale"] as any);
  }
  if (filters?.property_type) query = query.eq("property_type", filters.property_type as any);
  if (filters?.owner_id) query = query.eq("owner_id", filters.owner_id);
  if (!filters?.owner_id) query = query.eq("status", (filters?.status || "active") as any);

  // Numeric filters
  if (filters?.price_min != null) query = query.gte("price", filters.price_min);
  if (filters?.price_max != null) query = query.lte("price", filters.price_max);
  if (filters?.beds_min != null) query = query.gte("bedrooms", filters.beds_min);
  if (filters?.beds_max != null) query = query.lte("bedrooms", filters.beds_max);
  if (filters?.baths_min != null) query = query.gte("bathrooms", filters.baths_min);
  if (filters?.baths_max != null) query = query.lte("bathrooms", filters.baths_max);
  if (filters?.sqm_min != null) query = query.gte("sqm", filters.sqm_min);
  if (filters?.sqm_max != null) query = query.lte("sqm", filters.sqm_max);
  if (filters?.floor_min != null) query = query.gte("floor", filters.floor_min);
  if (filters?.floor_max != null) query = query.lte("floor", filters.floor_max);
  if (filters?.year_min != null) query = query.gte("year_built", filters.year_min);
  if (filters?.year_max != null) query = query.lte("year_built", filters.year_max);
  if (filters?.heating_system) query = query.eq("heating_system", filters.heating_system);
  if (filters?.construction_status) query = query.eq("construction_status", filters.construction_status);
  if (filters?.commercial_subtype) query = query.eq("commercial_subtype", filters.commercial_subtype);
  if (filters?.is_pre_sale === true) query = query.eq("is_pre_sale", true);
  if (filters?.is_off_market === true) query = query.eq("is_off_market", true);
  if (filters?.energy_class?.length) query = query.in("energy_class", filters.energy_class);

  // Feature booleans (e.g. has_elevator, has_parking)
  for (const feat of filters?.features ?? []) {
    query = query.eq(feat, true);
  }

  return query;
}

async function fetchListingsPage(filters?: ListingsFilters, page = 1, pageSize = 24) {
  const from = (page - 1) * pageSize;
  const { data, error } = await buildListingsQuery(filters, from, pageSize);

  if (error) throw error;
  const rows = data ?? [];

  // Enrich with owner profiles
  const ownerIds = [...new Set(rows.map((r: any) => r.owner_id).filter(Boolean))];
  let profileMap = new Map();
  if (ownerIds.length > 0) {
    const { data: ownerProfiles = [] } = await supabase
      .from("profiles_public")
      .select("user_id, display_name, avatar_url")
      .in("user_id", ownerIds);
    profileMap = new Map((ownerProfiles as any[]).map((p: any) => [p.user_id, p]));
  }

  const enriched = rows.map((r: any) => ({
    ...r,
    profiles: profileMap.get(r.owner_id) ?? null,
  }));

  // Sort: featured → priority → created_at
  enriched.sort((a: any, b: any) => {
    const aFeat = a.is_featured ? 1 : 0;
    const bFeat = b.is_featured ? 1 : 0;
    if (bFeat !== aFeat) return bFeat - aFeat;
    const aPri = Number(a.priority_placement ?? 0);
    const bPri = Number(b.priority_placement ?? 0);
    if (bPri !== aPri) return bPri - aPri;
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });

  return { data: enriched, hasMore: rows.length === pageSize };
}

/** Paginated listings for grid view — fetches 24 per page, server-side filtering */
export const PAGE_SIZE = 24;

export function useListingsPaginated(filters?: ListingsFilters) {
  return useInfiniteQuery({
    queryKey: ["listings-paginated", filters],
    queryFn: ({ pageParam = 1 }) => fetchListingsPage(filters, pageParam, PAGE_SIZE),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasMore ? allPages.length + 1 : undefined,
    initialPageParam: 1,
  });
}

/** All listings for map/split view — fetches in batches up to limit. Set enabled: false to skip. */
export function useListings(
  filters?: ListingsFilters,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ["listings", filters],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const FETCH_LIMIT = 500;
      const pageSize = filters?.pageSize ?? FETCH_LIMIT;
      let allData: any[] = [];
      let from = 0;

      while (true) {
        const { data, error } = await buildListingsQuery(filters, from, pageSize);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allData = allData.concat(data);
        if (filters?.limit && allData.length >= filters.limit) {
          allData = allData.slice(0, filters.limit);
          break;
        }
        if (data.length < pageSize) break;
        from += pageSize;
      }
      if (allData.length === 0) return allData;

      allData.sort((a: any, b: any) => {
        const aFeat = a.is_featured ? 1 : 0;
        const bFeat = b.is_featured ? 1 : 0;
        if (bFeat !== aFeat) return bFeat - aFeat;
        const aPri = Number(a.priority_placement ?? 0);
        const bPri = Number(b.priority_placement ?? 0);
        if (bPri !== aPri) return bPri - aPri;
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      });

      const ownerIds = [...new Set(allData.map((r: any) => r.owner_id).filter(Boolean))];
      const { data: ownerProfiles = [] } = await supabase
        .from("profiles_public")
        .select("user_id, display_name, avatar_url")
        .in("user_id", ownerIds);
      const profileMap = new Map((ownerProfiles as any[]).map((p: any) => [p.user_id, p]));
      return allData.map((r: any) => ({
        ...r,
        profiles: profileMap.get(r.owner_id) ?? null,
      }));
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
      // Increment view count and log event for trends (fire-and-forget)
      const { data: { user } } = await supabase.auth.getUser();
      Promise.all([
        supabase.from("listings").update({ views_count: (data?.views_count || 0) + 1 }).eq("id", id),
        supabase.from("listing_view_events").insert({ listing_id: id, viewer_id: user?.id ?? null }),
      ]).catch(() => {});
      // Fetch owner profile and Pro status (Pro owners can receive messages and calendar)
      let profiles = null;
      let ownerIsPro = false;
      let ownerParticipantType: "agent" | "seller" | null = null;
      if (data?.owner_id) {
        const [{ data: profilePublic }, { data: profileFull }, { data: invSub }] = await Promise.all([
          supabase.from("profiles_public").select("user_id, display_name, avatar_url").eq("user_id", data.owner_id).maybeSingle(),
          supabase.from("profiles").select("user_id, role, bio").eq("user_id", data.owner_id).maybeSingle(),
          supabase.from("investor_subscriptions").select("tier, status").eq("user_id", data.owner_id).order("started_at", { ascending: false }).limit(1).maybeSingle(),
        ]);
        profiles = profilePublic ?? null;
        ownerIsPro = !!(invSub?.status === "active" && (invSub?.tier || "").toLowerCase() === "pro");
        if (profileFull) {
          ownerParticipantType = getOwnerParticipantType(profileFull);
        }
      }
      return { ...data, profiles, ownerIsPro, ownerParticipantType };
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
      queryClient.invalidateQueries({ queryKey: ["listings-paginated"] });
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
      queryClient.invalidateQueries({ queryKey: ["listings-paginated"] });
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
      queryClient.invalidateQueries({ queryKey: ["listings-paginated"] });
      toast.success("Listing deleted.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useMyListings() {
  const { user } = useAuth();
  return useListings({ owner_id: user?.id });
}
