import { supabase } from "@/integrations/supabase/client";
import {
  publicHomepageRows,
  sortByImagePresence,
  type HomepageListing,
} from "@/lib/homepageListings";

export type OpenHouseTransactionType = "sale" | "rent";

const PROJECT_UNIT_CARD_SELECT = ["id", "availability_status", "internal_sqm"].join(",");
const LISTING_PROJECT_CARD_SELECT = [
  "name",
  "delivery_date",
  `project_units!project_units_project_id_fkey(${PROJECT_UNIT_CARD_SELECT})`,
].join(",");

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
  "priority_placement",
  "is_pre_sale",
  "construction_status",
  "latitude",
  "longitude",
  "has_parking",
  "has_pool",
  "has_elevator",
  "has_garden",
  "has_smart_home",
  `project:projects!listings_project_id_fkey(${LISTING_PROJECT_CARD_SELECT})`,
  "listing_images(url,sort_order)",
].join(",");

const withImageOrder = <T extends {
  order: (column: string, options?: Record<string, unknown>) => T;
  limit: (count: number, options?: Record<string, unknown>) => T;
}>(query: T): T =>
  query
    .order("sort_order", { referencedTable: "listing_images", ascending: true })
    .limit(3, { referencedTable: "listing_images" });

export async function fetchHomepageFeaturedFallback(): Promise<HomepageListing[]> {
  const query = withImageOrder(
    supabase
      .from("listings")
      .select(PUBLIC_CARD_LISTING_SELECT)
      .eq("status", "active")
      .eq("is_off_market", false)
      .in("listing_type", ["sale", "new_build"])
      .order("created_at", { ascending: false })
      .limit(12),
  );

  const { data, error } = await query;
  if (error) throw error;
  return publicHomepageRows((data ?? []) as unknown as HomepageListing[], 4);
}

export async function fetchHomepageOpenHousesFallback(): Promise<HomepageListing[]> {
  const query = withImageOrder(
    supabase
      .from("listings")
      .select(PUBLIC_CARD_LISTING_SELECT)
      .eq("status", "active")
      .eq("is_off_market", false)
      .eq("listing_type", "open_house")
      .gte("open_house_date", new Date().toISOString())
      .order("open_house_date", { ascending: true })
      .limit(12),
  );

  const { data, error } = await query;
  if (error) throw error;
  return sortByImagePresence(publicHomepageRows((data ?? []) as unknown as HomepageListing[], 6));
}

export async function fetchOpenHousesFallback({
  showPast,
  transactionType,
  limit,
}: {
  showPast: boolean;
  transactionType?: OpenHouseTransactionType | null;
  limit: number;
}): Promise<HomepageListing[]> {
  const now = new Date().toISOString();
  let query = withImageOrder(
    supabase
      .from("listings")
      .select(PUBLIC_CARD_LISTING_SELECT)
      .eq("status", "active")
      .eq("is_off_market", false)
      .eq("listing_type", "open_house")
      .limit(limit),
  );

  if (transactionType) query = query.eq("open_house_transaction_type", transactionType);
  query = showPast
    ? query.lt("open_house_date", now).order("open_house_date", { ascending: false })
    : query.gte("open_house_date", now).order("open_house_date", { ascending: true });

  const { data, error } = await query;
  if (error) throw error;
  return sortByImagePresence((data ?? []) as unknown as HomepageListing[]);
}

export async function fetchAuctionsFallback<T = HomepageListing>(limit: number): Promise<T[]> {
  const today = new Date().toISOString().slice(0, 10);
  const query = withImageOrder(
    supabase
      .from("listings")
      .select(PUBLIC_CARD_LISTING_SELECT)
      .eq("status", "active")
      .eq("is_off_market", false)
      .eq("listing_type", "auction")
      .or(`auction_date.gte.${today},auction_date.is.null`)
      .order("is_featured", { ascending: false })
      .order("priority_placement", { ascending: false, nullsFirst: false })
      .order("auction_date", { ascending: true, nullsFirst: false })
      .limit(limit),
  );

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as T[];
}
