import { supabase } from "@/integrations/supabase/client";
import {
  publicHomepageRows,
  sortByImagePresence,
  type HomepageListing,
} from "@/lib/homepageListings";

export type OpenHouseTransactionType = "sale" | "rent";

export const PUBLIC_CARD_LISTING_SELECT = [
  "id",
  "owner_id",
  "created_at",
  "title",
  "address",
  "city",
  "region",
  "price",
  "price_per_sqm",
  "bedrooms",
  "bathrooms",
  "sqm",
  "floor",
  "total_floors",
  "year_built",
  "energy_class",
  "cover_image_url",
  "property_type",
  "listing_type",
  "open_house_transaction_type",
  "project_id",
  "auction_date",
  "auction_starting_bid",
  "auction_court",
  "website_url",
  "open_house_date",
  "ai_score",
  "views_count",
  "tags",
  "is_featured",
  "featured_until",
  "priority_placement",
  "priority_until",
  "is_pre_sale",
  "construction_status",
  "latitude",
  "longitude",
  "has_parking",
  "has_pool",
  "has_elevator",
  "has_garden",
  "has_smart_home",
  "project",
  "listing_images",
].join(",");

type AbortableQuery<T> = T & { abortSignal?: (signal: AbortSignal) => T };

const withAbortSignal = <T>(query: T, signal?: AbortSignal): T => {
  const abortable = query as AbortableQuery<T>;
  return signal && typeof abortable.abortSignal === "function"
    ? abortable.abortSignal(signal)
    : query;
};

export async function fetchHomepageFeaturedFallback(signal?: AbortSignal): Promise<HomepageListing[]> {
  const query = supabase
      .rpc("get_public_listing_catalogue")
      .select(PUBLIC_CARD_LISTING_SELECT)
      .eq("status", "active")
      .eq("is_off_market", false)
      .in("listing_type", ["sale", "new_build"])
      .eq("is_featured", true)
      .gt("featured_until", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(12);

  const { data, error } = await withAbortSignal(query, signal);
  if (error) throw error;
  return publicHomepageRows((data ?? []) as unknown as HomepageListing[], 4);
}

export async function fetchHomepageOpenHousesFallback(signal?: AbortSignal): Promise<HomepageListing[]> {
  const query = supabase
      .rpc("get_public_listing_catalogue")
      .select(PUBLIC_CARD_LISTING_SELECT)
      .eq("status", "active")
      .eq("is_off_market", false)
      .eq("listing_type", "open_house")
      .gte("open_house_date", new Date().toISOString())
      .order("open_house_date", { ascending: true })
      .limit(12);

  const { data, error } = await withAbortSignal(query, signal);
  if (error) throw error;
  return sortByImagePresence(publicHomepageRows((data ?? []) as unknown as HomepageListing[], 6));
}

export async function fetchOpenHousesFallback({
  showPast,
  transactionType,
  limit,
  signal,
}: {
  showPast: boolean;
  transactionType?: OpenHouseTransactionType | null;
  limit: number;
  signal?: AbortSignal;
}): Promise<HomepageListing[]> {
  const now = new Date().toISOString();
  let query = supabase
      .rpc("get_public_listing_catalogue")
      .select(PUBLIC_CARD_LISTING_SELECT)
      .eq("status", "active")
      .eq("is_off_market", false)
      .eq("listing_type", "open_house")
      .limit(limit);

  if (transactionType) query = query.eq("open_house_transaction_type", transactionType);
  query = showPast
    ? query.lt("open_house_date", now).order("open_house_date", { ascending: false })
    : query.gte("open_house_date", now).order("open_house_date", { ascending: true });

  const { data, error } = await withAbortSignal(query, signal);
  if (error) throw error;
  return sortByImagePresence((data ?? []) as unknown as HomepageListing[]);
}

export async function fetchAuctionsFallback<T = HomepageListing>(limit: number, signal?: AbortSignal): Promise<T[]> {
  const today = new Date().toISOString().slice(0, 10);
  const query = supabase
      .rpc("get_public_listing_catalogue")
      .select(PUBLIC_CARD_LISTING_SELECT)
      .eq("status", "active")
      .eq("is_off_market", false)
      .eq("listing_type", "auction")
      .or(`auction_date.gte.${today},auction_date.is.null`)
      .order("auction_date", { ascending: true, nullsFirst: false })
      .limit(limit);

  const { data, error } = await withAbortSignal(query, signal);
  if (error) throw error;
  return (data ?? []) as T[];
}
