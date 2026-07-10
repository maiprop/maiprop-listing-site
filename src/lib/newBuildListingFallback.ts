import { supabase } from "@/integrations/supabase/client";
import type { NewBuildListing } from "@/lib/newBuildProjectDetail";

const PROJECT_UNIT_SELECT = [
  "id",
  "listing_id",
  "unit_id",
  "unit_number",
  "floor",
  "availability_status",
  "internal_sqm",
  "balcony_sqm",
  "storage_sqm",
  "parking_sqm",
  "bedrooms",
  "bathrooms",
  "kitchen_type",
  "living_rooms",
  "price",
  "price_per_sqm",
  "vat_included",
  "parking_price",
  "storage_price",
  "sea_view",
  "city_view",
  "mountain_view",
  "energy_class",
  "heating_system",
  "cooling_system",
].join(",");
const PROJECT_MEDIA_SELECT = ["id", "url", "media_type", "title", "sort_order"].join(",");
const PROJECT_SELECT = [
  "id",
  "name",
  "description",
  "address",
  "city",
  "municipality",
  "latitude",
  "longitude",
  "cover_image_url",
  "developer_company",
  "architect_group",
  "construction_company",
  "building_permit_number",
  "area_description",
  "permit_approval_date",
  "construction_start_date",
  "structural_completion_date",
  "delivery_date",
  "status",
  `project_units!project_units_project_id_fkey(${PROJECT_UNIT_SELECT})`,
  `project_media!project_media_project_id_fkey(${PROJECT_MEDIA_SELECT})`,
].join(",");
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
  `project:projects!listings_project_id_fkey(${PROJECT_SELECT})`,
  "listing_images(url,sort_order)",
].join(",");

export async function fetchNewBuildListingFallback(
  listingId: string,
  signal?: AbortSignal,
): Promise<NewBuildListing | null> {
  const query = supabase
    .from("listings")
    .select(NEW_BUILD_LISTING_SELECT)
    .eq("id", listingId)
    .eq("status", "active")
    .eq("is_off_market", false);
  const { data, error } = await (signal ? query.abortSignal(signal) : query).maybeSingle();

  if (error) throw error;
  return (data ?? null) as NewBuildListing | null;
}
