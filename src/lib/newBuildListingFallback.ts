import { supabase } from "@/integrations/supabase/client";
import type { NewBuildListing } from "@/lib/newBuildProjectDetail";

const NEW_BUILD_LISTING_SELECT = [
  "id",
  "owner_id",
  "project_id",
  "created_at",
  "updated_at",
  "status",
  "title",
  "description",
  "address",
  "city",
  "region",
  "price",
  "price_per_sqm",
  "sqm",
  "bedrooms",
  "bathrooms",
  "floor",
  "total_floors",
  "year_built",
  "energy_class",
  "cover_image_url",
  "property_type",
  "listing_type",
  "construction_status",
  "ai_score",
  "views_count",
  "tags",
  "is_featured",
  "priority_placement",
  "is_pre_sale",
  "walkability_score",
  "safety_score",
  "noise_score",
  "latitude",
  "longitude",
  "project:project_detail",
  "listing_images:listing_images_detail",
].join(",");

export async function fetchNewBuildListingFallback(
  listingId: string,
  signal?: AbortSignal,
): Promise<NewBuildListing | null> {
  const query = supabase
    .from("public_listing_catalogue")
    .select(NEW_BUILD_LISTING_SELECT)
    .eq("id", listingId)
    .eq("status", "active")
    .eq("is_off_market", false);
  const { data, error } = await (signal ? query.abortSignal(signal) : query).maybeSingle();

  if (error) throw error;
  return (data ?? null) as NewBuildListing | null;
}
