import type { ListingCard, ListingType } from "@/types";
import type { NewBuildCardProject } from "@/lib/newBuildCardSummary";

export const LISTING_KINDS = [
  "sale",
  "rent",
  "auction",
  "firesale",
  "open_house",
  "new_build",
] as const satisfies readonly ListingType[];

export type ListingKind = (typeof LISTING_KINDS)[number];

export const TRANSACTION_TYPES = ["sale", "rent"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export type OwnerSummary = {
  name: string;
  verified: boolean;
  avatar?: string;
};

export type ProjectSummary = {
  unitSizeMin?: number;
  unitSizeMax?: number;
  unitCount?: number;
  availableUnitCount?: number;
  deliveryYear?: number;
};

export type EntitlementResult = {
  allowed: boolean;
  audience?: string | null;
  planKey?: string | null;
  productId?: string | null;
  reason?: string;
};

export type PropertyCardViewModel = ListingCard;

export type DbListingCardProfile = {
  display_name?: string | null;
  verified?: boolean | null;
  avatar_url?: string | null;
  role?: string | null;
  participant_type?: string | null;
};

export type DbListingCardImage = {
  url?: string | null;
};

export type DbListingCardRow = {
  publicationId?: number;
  id: string;
  title: string;
  address?: string | null;
  city: string;
  price: number | string | null;
  price_per_sqm?: number | string | null;
  sqm: number | string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  floor?: number | null;
  total_floors?: number | null;
  year_built?: number | null;
  energy_class?: string | null;
  cover_image_url?: string | null;
  listing_images?: DbListingCardImage[] | null;
  property_type: ListingCard["type"];
  listing_type: ListingKind;
  open_house_transaction_type?: string | null;
  open_house_date?: string | null;
  auction_date?: string | null;
  auction_starting_bid?: number | string | null;
  ai_score?: number | null;
  views_count?: number | null;
  profiles?: DbListingCardProfile | null;
  tags?: string[] | null;
  has_parking?: boolean | null;
  has_pool?: boolean | null;
  has_elevator?: boolean | null;
  has_garden?: boolean | null;
  has_smart_home?: boolean | null;
  has_video_tour?: boolean | null;
  has_virtual_tour?: boolean | null;
  is_featured?: boolean | null;
  featured_until?: string | null;
  priority_placement?: number | string | null;
  priority_until?: string | null;
  is_pre_sale?: boolean | null;
  construction_status?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  walkability_score?: number | string | null;
  safety_score?: number | string | null;
  noise_score?: number | string | null;
  project?: NewBuildCardProject | null;
  projects?: NewBuildCardProject | null;
};

export const normalizeOpenHouseTransactionType = (value: unknown): TransactionType =>
  value === "rent" ? "rent" : "sale";
